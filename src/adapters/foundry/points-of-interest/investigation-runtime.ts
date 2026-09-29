import { SYSTEM_ID } from "../../../config/system-config";
import {
  advanceInvestigationRound, readInvestigationRuntime, setAgentActed, startInvestigation,
  type InvestigationRuntime,
} from "../../../core/investigation/investigation-runtime";
import { broadcastPoiInvalidation } from "./poi-runtime-queries";

export const INVESTIGATION_RUNTIME_FLAG = "investigationRuntime";
const INVESTIGATION_RUNTIME_PATH = `flags.${SYSTEM_ID}.${INVESTIGATION_RUNTIME_FLAG}`;
const RUNTIME_QUERY = `${SYSTEM_ID}.investigationRuntime`;
const RUNTIME_MUTATION_QUERY = `${SYSTEM_ID}.investigationRuntimeMutation`;

export interface InvestigationParticipant { readonly uuid: string; readonly name: string; readonly img: string }
export interface InvestigationControlView {
  readonly runtime: InvestigationRuntime | null;
  readonly participants: readonly InvestigationParticipant[];
}
export type InvestigationRuntimeMutation =
  | { readonly action: "start"; readonly sceneId: string }
  | { readonly action: "end"; readonly sceneId: string; readonly runId: string }
  | { readonly action: "advance"; readonly sceneId: string; readonly runId: string }
  | { readonly action: "acted"; readonly sceneId: string; readonly runId: string; readonly actorUuid: string; readonly acted: boolean };
export type InvestigationRuntimeMutationResult = { readonly ok: true } |
  { readonly ok: false; readonly reason: "forbidden" | "unavailable" | "stale" | "invalid" };

export function sceneInvestigationRuntime(scene: foundry.documents.Scene): InvestigationRuntime | null {
  return readInvestigationRuntime(scene.getFlag(SYSTEM_ID, INVESTIGATION_RUNTIME_FLAG));
}

export function investigationParticipants(scene: foundry.documents.Scene): readonly InvestigationParticipant[] {
  const actors = new Map<string, InvestigationParticipant>();
  for (const token of scene.tokens) {
    if (!token.actorId || token.actorLink === false) continue;
    const actor = game.actors.get(token.actorId);
    if (!actor || actor.type !== "agent" || !actor.uuid.startsWith("Actor.")) continue;
    actors.set(actor.uuid, { uuid: actor.uuid, name: actor.name, img: actor.img ?? "" });
  }
  return [...actors.values()];
}

const queues = new Map<string, Promise<InvestigationRuntimeMutationResult>>();
function serialize(sceneId: string, run: () => Promise<InvestigationRuntimeMutationResult>): Promise<InvestigationRuntimeMutationResult> {
  const previous = queues.get(sceneId);
  const result = (previous ?? Promise.resolve({ ok: true } as InvestigationRuntimeMutationResult)).then(run, run);
  queues.set(sceneId, result);
  void result.then(() => { if (queues.get(sceneId) === result) queues.delete(sceneId); },
    () => { if (queues.get(sceneId) === result) queues.delete(sceneId); });
  return result;
}

function currentSceneId(): string | null {
  return (globalThis as typeof globalThis & { canvas?: { scene?: { id?: string } } }).canvas?.scene?.id ?? null;
}

async function writeMutation(input: InvestigationRuntimeMutation, requester: foundry.documents.User): Promise<InvestigationRuntimeMutationResult> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id || !requester.isGM
    || (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(requester.id) !== requester)
    return { ok: false, reason: "forbidden" };
  if (!input || typeof input.sceneId !== "string" || !["start", "end", "advance", "acted"].includes(input.action))
    return { ok: false, reason: "invalid" };
  const scene = game.scenes.get(input.sceneId);
  if (!scene || currentSceneId() !== scene.id) return { ok: false, reason: "unavailable" };
  const current = sceneInvestigationRuntime(scene);
  if (input.action === "start") {
    const stored = scene.getFlag(SYSTEM_ID, INVESTIGATION_RUNTIME_FLAG);
    if (stored !== undefined && stored !== null && !current) return { ok: false, reason: "invalid" };
    if (current) return { ok: false, reason: "stale" };
    await scene.update({ [INVESTIGATION_RUNTIME_PATH]: startInvestigation(crypto.randomUUID()) });
  } else {
    if (!current || current.runId !== input.runId) return { ok: false, reason: "stale" };
    if (input.action === "end") {
      await scene.update({ [`flags.${SYSTEM_ID}.-=${INVESTIGATION_RUNTIME_FLAG}`]: null });
    } else if (input.action === "advance") {
      await scene.update({ [INVESTIGATION_RUNTIME_PATH]: advanceInvestigationRound(current) });
    } else {
      if (typeof input.acted !== "boolean" || !investigationParticipants(scene).some(actor => actor.uuid === input.actorUuid))
        return { ok: false, reason: "invalid" };
      await scene.update({ [INVESTIGATION_RUNTIME_PATH]: setAgentActed(current, input.actorUuid, input.acted) });
    }
  }
  await broadcastPoiInvalidation();
  return { ok: true };
}

export async function mutateInvestigationRuntime(input: InvestigationRuntimeMutation): Promise<InvestigationRuntimeMutationResult> {
  if (!game.user?.isGM) return { ok: false, reason: "forbidden" };
  const active = game.users.activeGM;
  if (!active) return { ok: false, reason: "unavailable" };
  return active.id === game.user.id
    ? serialize(input.sceneId, () => writeMutation(input, game.user))
    : active.query(RUNTIME_MUTATION_QUERY, input, { timeout: 10000 }) as Promise<InvestigationRuntimeMutationResult>;
}

export async function requestInvestigationControl(sceneId: string): Promise<InvestigationControlView | null> {
  if (!game.user?.isGM) return null;
  const active = game.users.activeGM;
  if (!active) return null;
  if (active.id !== game.user.id) return active.query(RUNTIME_QUERY, { sceneId }, { timeout: 10000 }) as Promise<InvestigationControlView | null>;
  const scene = game.scenes.get(sceneId);
  return scene ? { runtime: sceneInvestigationRuntime(scene), participants: investigationParticipants(scene) } : null;
}

export function registerInvestigationRuntimeQueries(): void {
  const queries = (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries;
  queries[RUNTIME_QUERY] = (data: { sceneId?: unknown }, context: { user: foundry.documents.User }) => {
    if (!context.user.isGM || typeof data?.sceneId !== "string") return null;
    const scene = game.scenes.get(data.sceneId);
    return scene ? { runtime: sceneInvestigationRuntime(scene), participants: investigationParticipants(scene) } : null;
  };
  queries[RUNTIME_MUTATION_QUERY] = (data: InvestigationRuntimeMutation, context: { user: foundry.documents.User }) =>
    serialize(String(data?.sceneId), () => writeMutation(data, context.user));
}

export async function recordInvestigationActionSuccess(
  sceneId: string, runId: string, actorUuid: string, action: "recap" | "share",
): Promise<boolean> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return false;
  return serialize(sceneId, async () => {
    const scene = game.scenes.get(sceneId);
    const runtime = scene ? sceneInvestigationRuntime(scene) : null;
    if (!scene || !runtime || runtime.runId !== runId || !investigationParticipants(scene).some(actor => actor.uuid === actorUuid))
      return { ok: false, reason: "stale" } as InvestigationRuntimeMutationResult;
    const key = action === "recap" ? "recapSuccessActorUuid" : "shareSuccessActorUuid";
    if (runtime[key]) return { ok: false, reason: "stale" } as InvestigationRuntimeMutationResult;
    await scene.update({ [INVESTIGATION_RUNTIME_PATH]: { ...runtime, [key]: actorUuid } });
    await broadcastPoiInvalidation();
    return { ok: true } as InvestigationRuntimeMutationResult;
  }).then(result => result.ok);
}

export async function recordInvestigationAgentActed(sceneId: string, runId: string, actorUuid: string): Promise<boolean> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return false;
  const result = await serialize(sceneId, async () => {
    const scene = game.scenes.get(sceneId);
    const runtime = scene ? sceneInvestigationRuntime(scene) : null;
    if (!scene || !runtime || runtime.runId !== runId
      || !investigationParticipants(scene).some(actor => actor.uuid === actorUuid))
      return { ok: false, reason: "stale" } as const;
    if (runtime.actedAgentUuids.includes(actorUuid)) return { ok: true } as const;
    await scene.update({ [INVESTIGATION_RUNTIME_PATH]: setAgentActed(runtime, actorUuid, true) });
    await broadcastPoiInvalidation();
    return { ok: true } as const;
  });
  return result.ok;
}
