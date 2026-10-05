import { isSupportedCheckSnapshot } from "../../../application/checks/check-snapshot";
import { SYSTEM_ID } from "../../../config/system-config";
import { aptitudeSpecializationLabel, isSkillKey, skillLabel } from "../../../config/skills";
import { reachableInformationIds } from "../../../core/investigation/resolve-information";
import { readPointOfInterestInformation } from "../../../documents/item/point-of-interest-data";
import { resolveExamination } from "../../../features/points-of-interest/resolve-examination";
import { readAgentCheckSource } from "../actors/read-agent-check-source";
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";
import { resolveExaminePoi, type ExaminePoiInput } from "./examine-poi";
import { resolveInvestigatePoi } from "./investigate-poi";
import { recordInvestigationAgentActed } from "./investigation-runtime";
import { investigationParticipants, sceneInvestigationRuntime } from "./investigation-runtime";
import { serializePoiItemMutation } from "./poi-runtime-queries";
import { isGmControlledPoi, isPoiVisibleTo, readPoiKnowledge, readPoiVisibility, readScenePoiUuids, worldPoi } from "./poi-runtime-state";

export const COMMIT_POI_EXAMINATION_QUERY = `${SYSTEM_ID}.commitPoiExamination`;
const BINDING_FLAG = "poiExaminationBinding";
const RESULTS_FLAG = "poiExaminationResults";
const RESULT_CARD_FLAG = "poiExaminationResult";

interface ExaminationPlan {
  readonly messageId: string;
  readonly runId: string;
  readonly actorUuid: string;
  readonly passiveIds: readonly string[];
  readonly examinationIds: readonly string[];
  readonly lostPd: number;
}

function readPlans(item: foundry.documents.Item): ExaminationPlan[] {
  const value = item.getFlag(SYSTEM_ID, RESULTS_FLAG);
  return Array.isArray(value) ? value as ExaminationPlan[] : [];
}

async function publishExaminationResult(plan: ExaminationPlan, input: ExaminePoiInput,
  item: foundry.documents.Item, actor: foundry.documents.Actor): Promise<void> {
  const existing = (game as typeof game & { messages?: { contents: ChatMessage[] } }).messages?.contents
    .some(message => message.getFlag(SYSTEM_ID, RESULT_CARD_FLAG) === input.messageId);
  if (existing) return;
  const information = readPointOfInterestInformation(item.system);
  const contentFor = (ids: readonly string[]) => ids.map(id => information.find(entry => entry.id === id)?.content)
    .filter((content): content is string => typeof content === "string");
  await ensureSharedPartialsLoaded();
  const content = await foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/investigation-examination-card.hbs`, {
      title: "Examinar", actorName: actor.name, poiName: item.name,
      passive: contentFor(plan.passiveIds), examined: contentFor(plan.examinationIds),
      passiveCount: plan.passiveIds.length, examinedCount: plan.examinationIds.length,
      passivePlural: plan.passiveIds.length !== 1, examinedPlural: plan.examinationIds.length !== 1,
      skillName: input.skill === "aptitude" && input.specialization
        ? aptitudeSpecializationLabel(input.specialization as Parameters<typeof aptitudeSpecializationLabel>[0])
        : skillLabel(input.skill as Parameters<typeof skillLabel>[0]), lostPd: plan.lostPd,
      noExaminationFindings: plan.examinationIds.length === 0,
    });
  const whisper = (game.users as unknown as { contents: foundry.documents.User[] }).contents
    .filter(user => user.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    .map(user => user.id);
  await ChatMessage.create({ content, whisper, speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { [RESULT_CARD_FLAG]: input.messageId } } });
}

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

  const plans = readPlans(item);
  let plan = plans.find(value => value.messageId === input.messageId);
  if (plan && (plan.runId !== input.runId || plan.actorUuid !== input.actorUuid))
    return { ok: false, reason: "invalid" };
  if (!plan) {
    const information = readPointOfInterestInformation(item.system);
    const known = new Set(readPoiKnowledge(item).find(entry => entry.actorUuid === actor.uuid)?.informationIds ?? []);
    const source = readAgentCheckSource(actor);
    const value = input.skill === "aptitude"
      ? source.skills.aptitude[input.specialization as keyof typeof source.skills.aptitude]
      : source.skills[input.skill];
    if (typeof value !== "number") return { ok: false, reason: "invalid" };
    const passiveIds = reachableInformationIds(information, known, input.skill, input.specialization, value);
    const examinationIds = resolveExamination(information, new Set([...known, ...passiveIds]),
      input.skill, input.specialization, snapshot.total).newInformationIds;
    const pd = (actor.system as { resources?: { determination?: { value?: number } } }).resources?.determination?.value;
    plan = { messageId: input.messageId, runId: input.runId, actorUuid: actor.uuid,
      passiveIds, examinationIds, lostPd: examinationIds.length ? 0 : typeof pd === "number" && pd > 0 ? 1 : 0 };
    await item.update({ [`flags.${SYSTEM_ID}.${RESULTS_FLAG}`]:
      foundry.data.operators.ForcedReplacement.create([...plans, plan]) });
  }

  const passive = await resolveInvestigatePoi(input, requester);
  if (!passive.ok) return passive;
  const examined = await resolveExaminePoi(input, requester);
  if (!examined.ok) return examined;
  await publishExaminationResult(plan, input, item, actor);
  if (!await recordInvestigationAgentActed(input.sceneId, input.runId, input.actorUuid))
    return { ok: false, reason: "stale" };
  return { ok: true, passiveCount: plan.passiveIds.length,
    newCount: plan.examinationIds.length, lostPd: plan.lostPd };
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
