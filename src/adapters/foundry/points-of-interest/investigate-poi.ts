import { isSkillKey } from "../../../config/skills";
import { SYSTEM_ID } from "../../../config/system-config";
import { reachableInformationIds } from "../../../core/investigation/resolve-information";
import { isAptitudeSpecializationKey, readPointOfInterestInformation } from "../../../documents/item/point-of-interest-data";
import { readAgentCheckSource } from "../actors/read-agent-check-source";
import { sceneInvestigationRuntime, investigationParticipants } from "./investigation-runtime";
import { POI_DISCOVERY_PATH, readPoiDiscoveries } from "./poi-discovery";
import { broadcastPoiInvalidation, serializePoiItemMutation } from "./poi-runtime-queries";
import {
  isGmControlledPoi, isPoiVisibleTo, POI_KNOWLEDGE_PATH, readPoiKnowledge, readPoiVisibility,
  readScenePoiUuids, worldPoi,
} from "./poi-runtime-state";

export const INVESTIGATE_POI_QUERY = `${SYSTEM_ID}.investigatePoi`;
export interface InvestigatePoiInput {
  readonly sceneId: string;
  readonly runId: string;
  readonly itemUuid: string;
  readonly actorUuid: string;
  readonly skill: string;
  readonly specialization?: string;
}
export type InvestigatePoiResult = { readonly ok: true; readonly newCount: number } |
  { readonly ok: false; readonly reason: "forbidden" | "unavailable" | "invalid" | "stale" };

export async function resolveInvestigatePoi(input: InvestigatePoiInput, requester: foundry.documents.User): Promise<InvestigatePoiResult> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id
    || (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(requester.id) !== requester)
    return { ok: false, reason: "forbidden" };
  if (!input || typeof input.sceneId !== "string" || typeof input.runId !== "string"
    || typeof input.itemUuid !== "string" || typeof input.actorUuid !== "string" || !isSkillKey(input.skill)
    || (input.skill === "aptitude" ? !isAptitudeSpecializationKey(input.specialization) : input.specialization !== undefined))
    return { ok: false, reason: "invalid" };
  const scene = game.scenes.get(input.sceneId);
  const item = worldPoi(input.itemUuid);
  if (!scene || !item || !isGmControlledPoi(item) || !readScenePoiUuids(scene).includes(input.itemUuid))
    return { ok: false, reason: "unavailable" };
  const runtime = sceneInvestigationRuntime(scene);
  if (!runtime || runtime.runId !== input.runId) return { ok: false, reason: "stale" };
  if (!isPoiVisibleTo(readPoiVisibility(item), requester.id, requester.isGM)) return { ok: false, reason: "forbidden" };
  if (!investigationParticipants(scene).some(agent => agent.uuid === input.actorUuid)) return { ok: false, reason: "forbidden" };
  const actor = /^Actor\.[^.]+$/u.test(input.actorUuid) ? game.actors.get(input.actorUuid.slice(6)) : null;
  if (!actor || actor.uuid !== input.actorUuid || actor.type !== "agent"
    || !requester.isGM && !actor.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    return { ok: false, reason: "forbidden" };
  const source = readAgentCheckSource(actor);
  const value = input.skill === "aptitude"
    ? source.skills.aptitude[input.specialization as keyof typeof source.skills.aptitude]
    : source.skills[input.skill];
  if (typeof value !== "number") return { ok: false, reason: "invalid" };
  const knowledge = readPoiKnowledge(item).map(entry => ({ actorUuid: entry.actorUuid, informationIds: [...entry.informationIds] }));
  const entry = knowledge.find(candidate => candidate.actorUuid === actor.uuid);
  const known = new Set(entry?.informationIds ?? []);
  const newIds = reachableInformationIds(readPointOfInterestInformation(item.system), known,
    input.skill, input.specialization, value);
  if (!newIds.length) return { ok: true, newCount: 0 };
  if (entry) entry.informationIds.push(...newIds);
  else knowledge.push({ actorUuid: actor.uuid, informationIds: [...newIds] });
  const discoveries = readPoiDiscoveries(item);
  await item.update({
    [POI_KNOWLEDGE_PATH]: foundry.data.operators.ForcedReplacement.create({ agents: knowledge }),
    [POI_DISCOVERY_PATH]: foundry.data.operators.ForcedReplacement.create([
      ...discoveries, ...newIds.map(informationId => ({ runId: runtime.runId, actorUuid: actor.uuid, informationId })),
    ]),
  });
  await broadcastPoiInvalidation();
  return { ok: true, newCount: newIds.length };
}

export async function investigatePoi(input: InvestigatePoiInput): Promise<InvestigatePoiResult> {
  const active = game.users.activeGM;
  if (!active) return { ok: false, reason: "unavailable" };
  if (active.id === game.user?.id) return serializePoiItemMutation(input.itemUuid, () => resolveInvestigatePoi(input, game.user));
  try { return await active.query(INVESTIGATE_POI_QUERY, input, { timeout: 10000 }) as InvestigatePoiResult; }
  catch { return { ok: false, reason: "unavailable" }; }
}

export function registerInvestigatePoiQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[INVESTIGATE_POI_QUERY] =
    (input: InvestigatePoiInput, context: { user: foundry.documents.User }) =>
      serializePoiItemMutation(String(input?.itemUuid), () => resolveInvestigatePoi(input, context.user));
}
