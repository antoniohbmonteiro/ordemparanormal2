import { toolInformationIds } from "../../../core/investigation/resolve-information";
import { isToolApproach, readPointOfInterestInformation } from "../../../documents/item/point-of-interest-data";
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
/** Includes known and situational bindings when checking one interaction's configuration. */
export function laboratoryInteraction(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User): { length: LaboratoryLength; informationIds: readonly string[] } | null {
  const authorized = authorizedPoiToolContext(context, resolved, requester);
  if (!authorized || !resolved.isTool || !resolved.sourceUuid || resolved.use?.mechanic !== "laboratory") return null;
  const information = readPointOfInterestInformation(authorized.item.system);
  const approaches = information.flatMap(entry => entry.approaches.filter(isToolApproach))
    .filter(approach => approach.equipmentUuid === resolved.sourceUuid && approach.useFormId === resolved.use!.id);
  const length = approaches[0]?.mechanicConfig?.sequenceLength;
  if (!length || approaches.some(approach => approach.mechanicConfig?.type !== "laboratory"
    || approach.mechanicConfig.sequenceLength !== length)) return null;
  return { length, informationIds: toolInformationIds(information, new Set<string>(), resolved.sourceUuid, resolved.use.id, length) };
}
export interface ToolKnowledgeReceipt { ids?: readonly string[]; newCount?: number }
export function recoverToolKnowledgeCount(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  receipt: ToolKnowledgeReceipt): number | undefined {
  if (receipt.newCount !== undefined) return receipt.newCount;
  const item = worldPoi(context.itemUuid);
  const known = item && readPoiKnowledge(item).find(entry => entry.actorUuid === resolved.actor.uuid)?.informationIds;
  if (receipt.ids?.length && receipt.ids.every(id => known?.includes(id))) receipt.newCount = receipt.ids.length;
  return receipt.newCount;
}
export async function grantToolKnowledge(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User, laboratory?: { length: LaboratoryLength; informationIds: readonly string[] },
  receipt?: ToolKnowledgeReceipt): Promise<{ newCount: number; manual: boolean }> {
  return serializePoiItemMutation(context.itemUuid, async () => {
    const authorized = authorizedPoiToolContext(context, resolved, requester);
    if (!authorized) {
      if (laboratory) throw new Error("Laboratory context changed.");
      return { newCount: 0, manual: true };
    }
    const { item, runtime } = authorized;
    const { actor, use, sourceUuid, isTool } = resolved;
    if (!sourceUuid || !use || !isTool || !laboratory && use.mechanic !== "standard") return { newCount: 0, manual: true };
    if (laboratory && laboratoryInteraction(context, resolved, requester)?.length !== laboratory.length)
      throw new Error("Laboratory configuration changed.");
    if (receipt?.newCount !== undefined) {
      await broadcastPoiInvalidation();
      return { newCount: receipt.newCount, manual: false };
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
    const ids = toolInformationIds(readPointOfInterestInformation(item.system), known, sourceUuid, use.id, laboratory?.length)
      .filter(id => !laboratory || laboratory.informationIds.includes(id));
    if (!ids.length) {
      if (receipt) receipt.newCount = 0;
      return { newCount: 0, manual: true };
    }
    if (receipt) receipt.ids = ids;
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
