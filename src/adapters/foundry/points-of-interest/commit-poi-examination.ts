import { isSupportedCheckSnapshot } from "../../../application/checks/check-snapshot";
import { SYSTEM_ID } from "../../../config/system-config";
import { isSkillKey } from "../../../config/skills";
import { resolveExaminePoi, type ExaminePoiInput } from "./examine-poi";
import { resolveInvestigatePoi } from "./investigate-poi";
import { recordInvestigationAgentActed } from "./investigation-runtime";
import { investigationParticipants, sceneInvestigationRuntime } from "./investigation-runtime";
import { serializePoiItemMutation } from "./poi-runtime-queries";
import { isGmControlledPoi, isPoiVisibleTo, readPoiVisibility, readScenePoiUuids, worldPoi } from "./poi-runtime-state";

export const COMMIT_POI_EXAMINATION_QUERY = `${SYSTEM_ID}.commitPoiExamination`;
const BINDING_FLAG = "poiExaminationBinding";

export type CommitPoiExaminationResult =
  | { readonly ok: true; readonly passiveCount: number; readonly newCount: number; readonly lostPd: number }
  | { readonly ok: false; readonly reason: "invalid" | "forbidden" | "unavailable" | "stale" };

export async function resolveCommitPoiExamination(
  input: ExaminePoiInput, requester: foundry.documents.User,
): Promise<CommitPoiExaminationResult> {
  if (!input || !isSkillKey(input.skill) || typeof input.messageId !== "string")
    return { ok: false, reason: "invalid" };
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id
    || (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(requester.id) !== requester)
    return { ok: false, reason: "forbidden" };
  const scene = game.scenes.get(input.sceneId);
  const item = worldPoi(input.itemUuid);
  const actor = /^Actor\.[^.]+$/u.test(input.actorUuid) ? game.actors.get(input.actorUuid.slice(6)) : null;
  if (!scene || !item || !isGmControlledPoi(item) || !readScenePoiUuids(scene).includes(input.itemUuid))
    return { ok: false, reason: "unavailable" };
  if (sceneInvestigationRuntime(scene)?.runId !== input.runId) return { ok: false, reason: "stale" };
  if (!actor || actor.type !== "agent" || actor.uuid !== input.actorUuid
    || !investigationParticipants(scene).some(entry => entry.uuid === actor.uuid)
    || !isPoiVisibleTo(readPoiVisibility(item), requester.id, requester.isGM)
    || !requester.isGM && !actor.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    return { ok: false, reason: "forbidden" };
  const message = (game as typeof game & { messages?: { get(id: string): ChatMessage | undefined } }).messages?.get(input.messageId);
  const snapshot = message?.getFlag(SYSTEM_ID, "check");
  if (!message || !isSupportedCheckSnapshot(snapshot) || snapshot.schemaVersion !== 4
    || message.speaker.actor !== input.actorUuid?.slice(6)
    || !requester.isGM && message.author?.id !== requester.id
    || snapshot.check.kind !== (input.skill === "aptitude" ? "aptitude" : "skill")
    || snapshot.check.key !== (input.skill === "aptitude" ? input.specialization : input.skill))
    return { ok: false, reason: "invalid" };
  const binding = { schemaVersion: 1, sceneId: input.sceneId, runId: input.runId,
    itemUuid: input.itemUuid, actorUuid: input.actorUuid, skill: input.skill,
    specialization: input.specialization ?? null };
  const existing = message.getFlag(SYSTEM_ID, BINDING_FLAG);
  if (existing && (typeof existing !== "object" || Array.isArray(existing)
    || Object.entries(binding).some(([key, value]) => (existing as Record<string, unknown>)[key] !== value)))
    return { ok: false, reason: "invalid" };
  if (!existing) await message.update({ [`flags.${SYSTEM_ID}.${BINDING_FLAG}`]: binding });

  const passive = await resolveInvestigatePoi(input, requester);
  if (!passive.ok) return passive;
  const examined = await resolveExaminePoi(input, requester);
  if (!examined.ok) return examined;
  if (!await recordInvestigationAgentActed(input.sceneId, input.runId, input.actorUuid))
    return { ok: false, reason: "stale" };
  return { ok: true, passiveCount: passive.newCount, newCount: examined.newCount, lostPd: examined.lostPd };
}

export async function commitPoiExamination(input: ExaminePoiInput): Promise<CommitPoiExaminationResult> {
  const active = game.users.activeGM;
  if (!active) return { ok: false, reason: "unavailable" };
  if (active.id === game.user?.id)
    return serializePoiItemMutation(input.itemUuid, () => resolveCommitPoiExamination(input, game.user));
  try { return await active.query(COMMIT_POI_EXAMINATION_QUERY, input, { timeout: 10000 }) as CommitPoiExaminationResult; }
  catch { return { ok: false, reason: "unavailable" }; }
}

export function registerCommitPoiExaminationQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[COMMIT_POI_EXAMINATION_QUERY] =
    (input: ExaminePoiInput, context: { user: foundry.documents.User }) =>
      serializePoiItemMutation(String(input?.itemUuid), () => resolveCommitPoiExamination(input, context.user));
}
