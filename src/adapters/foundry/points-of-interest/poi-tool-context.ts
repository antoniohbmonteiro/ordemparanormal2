import type { RadioPuzzleConfig } from "../../../core/equipment/radio-puzzle";
import { hasPendingManualToolInformation, radioInformationIds, toolInformationIds } from "../../../core/investigation/resolve-information";
import { isToolApproach, isPointOfInterestInformationList, isLaboratoryMechanicConfig,
  readPointOfInterestInformation, copyToolMechanicConfig, toolMechanicSignature } from "../../../documents/item/point-of-interest-data";
import { isRadioPuzzleConfig } from "../../../core/equipment/radio-puzzle";
import type { LaboratoryLength } from "../../../core/equipment/laboratory-challenge";
import { activeEquipmentAuthority, type ResolvedEquipmentUse } from "../equipment/execute-equipment-use";
import { POI_DISCOVERY_PATH, readPoiDiscoveries } from "./poi-discovery";
import { investigationParticipants, sceneInvestigationRuntime } from "./investigation-runtime";
import { broadcastPoiInvalidation, serializePoiItemMutation } from "./poi-runtime-queries";
import { isGmControlledPoi, isPoiVisibleTo, readPoiVisibility, readScenePoiUuids, worldPoi,
  readPoiKnowledge, POI_KNOWLEDGE_PATH } from "./poi-runtime-state";

export interface PoiToolContext {
  readonly sceneId: string;
  readonly itemUuid: string;
  readonly runId: string | null;
}
export function isPoiToolContext(value: unknown): value is PoiToolContext {
  if (!value || typeof value !== "object") return false;
  const context = value as PoiToolContext;
  return typeof context.sceneId === "string" && typeof context.itemUuid === "string"
    && (context.runId === null || typeof context.runId === "string");
}
export function authorizedPoiToolContext(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User) {
  const scene = game.scenes.get(context.sceneId);
  const item = worldPoi(context.itemUuid);
  const runtime = scene ? sceneInvestigationRuntime(scene) : null;
  const { actor, equipment } = resolved;
  if (!activeEquipmentAuthority(requester) || !scene || !item || !isGmControlledPoi(item)
    || !readScenePoiUuids(scene).includes(context.itemUuid)
    || !isPoiVisibleTo(readPoiVisibility(item), requester.id, requester.isGM)
    || !investigationParticipants(scene).some(participant => participant.uuid === actor.uuid)
    || actor.getEmbeddedDocument("Item", equipment.id) !== equipment
    || !requester.isGM && !actor.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
    || (runtime?.runId ?? null) !== context.runId) return null;
  return { scene, item, runtime };
}
/** Server-only preparation outcome; never sent by the contextual query. */
export interface UnconfiguredPoiToolUse {
  readonly status: "unconfigured";
  readonly mechanic: "laboratory" | "radio";
}
function specialToolInformation(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User) {
  const authorized = authorizedPoiToolContext(context, resolved, requester);
  if (!authorized || !resolved.isTool || !resolved.sourceUuid || !resolved.use) return null;
  const source = (authorized.item.system as { information?: unknown }).information;
  if (!isPointOfInterestInformationList(source)) return null;
  const information = readPointOfInterestInformation(authorized.item.system);
  const approaches = information.flatMap(entry => entry.approaches.filter(isToolApproach))
    .filter(approach => approach.equipmentUuid === resolved.sourceUuid && approach.useFormId === resolved.use!.id);
  return { information, approaches };
}
/** Known and situational bindings still configure the interaction. Only a missing pair permits fallback. */
export function classifyLaboratoryInteraction(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User): { status: "ready"; interaction: { length: LaboratoryLength; informationIds: readonly string[] } }
    | { status: "absent" | "invalid" } {
  const data = specialToolInformation(context, resolved, requester);
  if (!data || resolved.use?.mechanic !== "laboratory") return { status: "invalid" };
  const { information, approaches } = data;
  if (!approaches.length) return { status: "absent" };
  const config = approaches[0].mechanicConfig;
  if (!isLaboratoryMechanicConfig(config) || approaches.some(approach => !isLaboratoryMechanicConfig(approach.mechanicConfig)
    || approach.mechanicConfig.sequenceLength !== config.sequenceLength)) return { status: "invalid" };
  return { status: "ready", interaction: { length: config.sequenceLength,
    informationIds: toolInformationIds(information, new Set<string>(), resolved.sourceUuid!, resolved.use.id, config.sequenceLength) } };
}
export function laboratoryInteraction(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User) {
  const result = classifyLaboratoryInteraction(context, resolved, requester);
  return result.status === "ready" ? result.interaction : null;
}
export function classifyRadioInteraction(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User): { status: "ready"; interaction: { config: RadioPuzzleConfig; informationIds: readonly string[] } }
    | { status: "absent" | "invalid" } {
  const data = specialToolInformation(context, resolved, requester);
  if (!data || resolved.use?.mechanic !== "radio") return { status: "invalid" };
  const { information, approaches } = data;
  if (!approaches.length) return { status: "absent" };
  const config = approaches[0]?.mechanicConfig;
  if (!isRadioPuzzleConfig(config) || approaches.some(approach => toolMechanicSignature(approach.mechanicConfig)
    !== toolMechanicSignature(config))) return { status: "invalid" };
  return { status: "ready", interaction: { config: copyToolMechanicConfig(config) as RadioPuzzleConfig,
    informationIds: radioInformationIds(information, new Set<string>(), resolved.sourceUuid!, resolved.use.id, config) } };
}
export function radioInteraction(context: PoiToolContext, resolved: ResolvedEquipmentUse, requester: foundry.documents.User) {
  const result = classifyRadioInteraction(context, resolved, requester);
  return result.status === "ready" ? result.interaction : null;
}
export interface ToolKnowledgeReceipt { ids?: readonly string[]; newCount?: number; manual?: boolean }
export function recoverToolKnowledgeCount(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  receipt: ToolKnowledgeReceipt): number | undefined {
  if (receipt.newCount !== undefined) return receipt.newCount;
  const item = worldPoi(context.itemUuid);
  const known = item && readPoiKnowledge(item).find(entry => entry.actorUuid === resolved.actor.uuid)?.informationIds;
  if (receipt.ids?.length && receipt.ids.every(id => known?.includes(id))) receipt.newCount = receipt.ids.length;
  return receipt.newCount;
}
export async function grantToolKnowledge(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User, challenge?: { length: LaboratoryLength; informationIds: readonly string[] } | { radioConfig: RadioPuzzleConfig; informationIds: readonly string[] },
  receipt?: ToolKnowledgeReceipt): Promise<{ newCount: number; manual: boolean }> {
  return serializePoiItemMutation(context.itemUuid, async () => {
    const authorized = authorizedPoiToolContext(context, resolved, requester);
    if (!authorized) {
      if (challenge) throw new Error("Laboratory context changed.");
      return { newCount: 0, manual: true };
    }
    const { item, runtime } = authorized;
    const { actor, use, sourceUuid, isTool } = resolved;
    if (!sourceUuid || !use || !isTool || !challenge && use.mechanic !== "standard") return { newCount: 0, manual: true };
    if (challenge && ("length" in challenge
      ? laboratoryInteraction(context, resolved, requester)?.length !== challenge.length
      : toolMechanicSignature(radioInteraction(context, resolved, requester)?.config) !== toolMechanicSignature(challenge.radioConfig)))
      throw new Error("Tool challenge configuration changed.");
    if (receipt?.newCount !== undefined) {
      await broadcastPoiInvalidation();
      return { newCount: receipt.newCount, manual: receipt.manual ?? false };
    }
    const knowledge = readPoiKnowledge(item).map(entry => ({ actorUuid: entry.actorUuid, informationIds: [...entry.informationIds] }));
    const entry = knowledge.find(candidate => candidate.actorUuid === actor.uuid);
    const known = new Set(entry?.informationIds ?? []);
    // An update rejection can follow a committed document write. Keep the original grant count on retry.
    if (receipt?.ids?.length && receipt.ids.every(id => known.has(id))) {
      receipt.newCount = receipt.ids.length;
      await broadcastPoiInvalidation();
      return { newCount: receipt.newCount, manual: false };
    }
    const currentInformation = readPointOfInterestInformation(item.system);
    const ids = (challenge && "radioConfig" in challenge
      ? radioInformationIds(currentInformation, known, sourceUuid, use.id, challenge.radioConfig)
      : toolInformationIds(currentInformation, known, sourceUuid, use.id, challenge && "length" in challenge ? challenge.length : undefined))
      .filter(id => !challenge || challenge.informationIds.includes(id));
    if (!ids.length) {
      const config = challenge && ("radioConfig" in challenge ? challenge.radioConfig
        : { type: "laboratory" as const, sequenceLength: challenge.length });
      const manual = hasPendingManualToolInformation(currentInformation, known, sourceUuid, use.id, config);
      if (receipt) { receipt.newCount = 0; receipt.manual = manual; }
      return { newCount: 0, manual };
    }
    if (receipt) { receipt.ids = ids; receipt.manual = false; }
    if (entry) entry.informationIds.push(...ids);
    else knowledge.push({ actorUuid: actor.uuid, informationIds: [...ids] });
    const update: Record<string, unknown> = {
      [POI_KNOWLEDGE_PATH]: foundry.data.operators.ForcedReplacement.create({ agents: knowledge }),
    };
    if (runtime) update[POI_DISCOVERY_PATH] = foundry.data.operators.ForcedReplacement.create([
      ...readPoiDiscoveries(item), ...ids.map(informationId => ({ runId: runtime.runId, actorUuid: actor.uuid, informationId })),
    ]);
    await item.update(update);
    if (receipt) receipt.newCount = ids.length;
    await broadcastPoiInvalidation();
    return { newCount: ids.length, manual: false };
  });
}
