import { isSupportedCheckSnapshot } from "../../../application/checks/check-snapshot";
import { isSkillKey } from "../../../config/skills";
import { SYSTEM_ID } from "../../../config/system-config";
import { readPointOfInterestInformation } from "../../../documents/item/point-of-interest-data";
import { resolveExamination } from "../../../features/points-of-interest/resolve-examination";
import { investigationParticipants, sceneInvestigationRuntime } from "./investigation-runtime";
import { POI_DISCOVERY_PATH, readPoiDiscoveries } from "./poi-discovery";
import { broadcastPoiInvalidation, serializePoiItemMutation } from "./poi-runtime-queries";
import { isGmControlledPoi, isPoiVisibleTo, POI_KNOWLEDGE_PATH, readPoiKnowledge,
  readPoiVisibility, readScenePoiUuids, worldPoi } from "./poi-runtime-state";

export const EXAMINE_POI_QUERY = `${SYSTEM_ID}.examinePoi`;
const EXAMINATIONS_FLAG = "pointOfInterestExaminations";
const EXAMINATIONS_PATH = `flags.${SYSTEM_ID}.${EXAMINATIONS_FLAG}`;
const ACTOR_EXAMINATIONS_FLAG = "investigationExaminations";
const ACTOR_EXAMINATIONS_PATH = `flags.${SYSTEM_ID}.${ACTOR_EXAMINATIONS_FLAG}`;

export interface ExaminePoiInput {
  readonly sceneId: string;
  readonly runId: string;
  readonly itemUuid: string;
  readonly actorUuid: string;
  readonly skill: string;
  readonly specialization?: string;
  readonly messageId: string;
}
export type ExaminePoiResult = { readonly ok: true; readonly newCount: number; readonly lostPd: number } |
  { readonly ok: false; readonly reason: "invalid" | "forbidden" | "unavailable" | "stale" };

function messageIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && !!id))] : [];
}

export async function resolveExaminePoi(input: ExaminePoiInput, requester: foundry.documents.User): Promise<ExaminePoiResult> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id
    || (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(requester.id) !== requester)
    return { ok: false, reason: "forbidden" };
  if (!input || typeof input.sceneId !== "string" || typeof input.runId !== "string"
    || typeof input.itemUuid !== "string" || typeof input.actorUuid !== "string"
    || typeof input.messageId !== "string" || !input.messageId || !isSkillKey(input.skill)
    || (input.skill === "aptitude" ? typeof input.specialization !== "string" : input.specialization !== undefined))
    return { ok: false, reason: "invalid" };
  const scene = game.scenes.get(input.sceneId);
  const item = worldPoi(input.itemUuid);
  if (!scene || !item || !isGmControlledPoi(item) || !readScenePoiUuids(scene).includes(input.itemUuid))
    return { ok: false, reason: "unavailable" };
  const runtime = sceneInvestigationRuntime(scene);
  if (!runtime || runtime.runId !== input.runId) return { ok: false, reason: "stale" };
  if (!isPoiVisibleTo(readPoiVisibility(item), requester.id, requester.isGM)
    || !investigationParticipants(scene).some(agent => agent.uuid === input.actorUuid))
    return { ok: false, reason: "forbidden" };
  const actor = /^Actor\.[^.]+$/u.test(input.actorUuid) ? game.actors.get(input.actorUuid.slice(6)) : null;
  if (!actor || actor.type !== "agent" || actor.uuid !== input.actorUuid
    || !requester.isGM && !actor.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    return { ok: false, reason: "forbidden" };
  const message = (game as typeof game & { messages?: { get(id: string): ChatMessage | undefined } }).messages?.get(input.messageId);
  const snapshot = message?.getFlag(SYSTEM_ID, "check");
  if (!message || message.speaker.actor !== actor.id || !isSupportedCheckSnapshot(snapshot) || snapshot.schemaVersion !== 4
    || snapshot.check.kind !== (input.skill === "aptitude" ? "aptitude" : "skill")
    || snapshot.check.key !== (input.skill === "aptitude" ? input.specialization : input.skill))
    return { ok: false, reason: "invalid" };
  const processedItem = messageIds(item.getFlag(SYSTEM_ID, EXAMINATIONS_FLAG));
  const processedActor = messageIds(actor.getFlag(SYSTEM_ID, ACTOR_EXAMINATIONS_FLAG));
  if (processedItem.includes(input.messageId) || processedActor.includes(input.messageId))
    return { ok: true, newCount: 0, lostPd: 0 };
  const knowledge = readPoiKnowledge(item).map(entry => ({ actorUuid: entry.actorUuid, informationIds: [...entry.informationIds] }));
  const entry = knowledge.find(candidate => candidate.actorUuid === actor.uuid);
  const resolution = resolveExamination(readPointOfInterestInformation(item.system),
    new Set(entry?.informationIds ?? []), input.skill, input.specialization, snapshot.total);
  if (resolution.newInformationIds.length) {
    if (entry) entry.informationIds.push(...resolution.newInformationIds);
    else knowledge.push({ actorUuid: actor.uuid, informationIds: [...resolution.newInformationIds] });
    await item.update({
      [POI_KNOWLEDGE_PATH]: foundry.data.operators.ForcedReplacement.create({ agents: knowledge }),
      [POI_DISCOVERY_PATH]: foundry.data.operators.ForcedReplacement.create([
        ...readPoiDiscoveries(item),
        ...resolution.newInformationIds.map(informationId => ({ runId: runtime.runId, actorUuid: actor.uuid, informationId })),
      ]),
      [EXAMINATIONS_PATH]: foundry.data.operators.ForcedReplacement.create([...processedItem, input.messageId]),
    });
    await broadcastPoiInvalidation();
    return { ok: true, newCount: resolution.newInformationIds.length, lostPd: 0 };
  }
  const currentPd = (actor.system as { resources?: { determination?: { value?: unknown } } }).resources?.determination?.value;
  if (typeof currentPd !== "number" || !Number.isInteger(currentPd) || currentPd < 0)
    return { ok: false, reason: "invalid" };
  const nextPd = Math.max(0, currentPd - 1);
  await actor.update({
    "system.resources.determination.value": nextPd,
    [ACTOR_EXAMINATIONS_PATH]: foundry.data.operators.ForcedReplacement.create([...processedActor, input.messageId]),
  });
  await broadcastPoiInvalidation();
  return { ok: true, newCount: 0, lostPd: currentPd - nextPd };
}

export async function examinePoi(input: ExaminePoiInput): Promise<ExaminePoiResult> {
  const active = game.users.activeGM;
  if (!active) return { ok: false, reason: "unavailable" };
  if (active.id === game.user?.id) return serializePoiItemMutation(input.itemUuid, () => resolveExaminePoi(input, game.user));
  try { return await active.query(EXAMINE_POI_QUERY, input, { timeout: 10000 }) as ExaminePoiResult; }
  catch { return { ok: false, reason: "unavailable" }; }
}

export function registerExaminePoiQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[EXAMINE_POI_QUERY] =
    (input: ExaminePoiInput, context: { user: foundry.documents.User }) =>
      serializePoiItemMutation(String(input?.itemUuid), () => resolveExaminePoi(input, context.user));
}
