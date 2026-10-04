import { SYSTEM_ID } from "../../../config/system-config";
import { toolInformationIds } from "../../../core/investigation/resolve-information";
import { readPointOfInterestInformation } from "../../../documents/item/point-of-interest-data";
import { activeEquipmentAuthority, executeEquipmentUse, isEquipmentUseIntent,
  type EquipmentUseIntent, type EquipmentUseResult, type ResolvedEquipmentUse } from "../equipment/execute-equipment-use";
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
export interface PoiToolIntent extends EquipmentUseIntent { readonly context: PoiToolContext }
export const POI_TOOL_USE_QUERY = `${SYSTEM_ID}.usePoiTool`;
export function isPoiToolContext(value: unknown): value is PoiToolContext {
  if (!value || typeof value !== "object") return false;
  const context = value as PoiToolContext;
  return typeof context.sceneId === "string" && typeof context.itemUuid === "string"
    && (context.runId === null || typeof context.runId === "string");
}

export async function revealToolInformation(context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User): Promise<{ newCount: number; manual: boolean }> {
  return serializePoiItemMutation(context.itemUuid, async () => {
    const scene = game.scenes.get(context.sceneId);
    const item = worldPoi(context.itemUuid);
    const runtime = scene ? sceneInvestigationRuntime(scene) : null;
    const { actor, equipment, use, sourceUuid, isTool } = resolved;
    if (!activeEquipmentAuthority(requester) || !scene || !item || !isGmControlledPoi(item)
      || !readScenePoiUuids(scene).includes(context.itemUuid)
      || !isPoiVisibleTo(readPoiVisibility(item), requester.id, requester.isGM)
      || !investigationParticipants(scene).some(participant => participant.uuid === actor.uuid)
      || actor.getEmbeddedDocument("Item", equipment.id) !== equipment
      || !requester.isGM && !actor.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
      || (runtime?.runId ?? null) !== context.runId) return { newCount: 0, manual: true };
    if (!sourceUuid || !use || !isTool) return { newCount: 0, manual: true };
    const knowledge = readPoiKnowledge(item).map(entry => ({ actorUuid: entry.actorUuid, informationIds: [...entry.informationIds] }));
    const entry = knowledge.find(candidate => candidate.actorUuid === actor.uuid);
    const ids = toolInformationIds(readPointOfInterestInformation(item.system), new Set(entry?.informationIds ?? []), sourceUuid, use.id);
    if (!ids.length) return { newCount: 0, manual: true };
    if (entry) entry.informationIds.push(...ids);
    else knowledge.push({ actorUuid: actor.uuid, informationIds: [...ids] });
    const update: Record<string, unknown> = {
      [POI_KNOWLEDGE_PATH]: foundry.data.operators.ForcedReplacement.create({ agents: knowledge }),
    };
    if (runtime) update[POI_DISCOVERY_PATH] = foundry.data.operators.ForcedReplacement.create([
      ...readPoiDiscoveries(item), ...ids.map(informationId => ({ runId: runtime.runId, actorUuid: actor.uuid, informationId })),
    ]);
    await item.update(update);
    await broadcastPoiInvalidation();
    return { newCount: ids.length, manual: false };
  });
}

export function resolvePoiToolUse(input: PoiToolIntent, requester: foundry.documents.User): Promise<EquipmentUseResult> {
  if (!activeEquipmentAuthority(requester)) return Promise.resolve({ status: "forbidden" });
  if (!isEquipmentUseIntent(input) || !isPoiToolContext(input.context)) return Promise.resolve({ status: "invalid" });
  const context = { sceneId: input.context.sceneId, itemUuid: input.context.itemUuid, runId: input.context.runId };
  return executeEquipmentUse(input, requester, JSON.stringify(context), resolved => revealToolInformation(context, resolved, requester));
}
export function registerPoiToolUseQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[POI_TOOL_USE_QUERY] =
    (input: PoiToolIntent, context: { user: foundry.documents.User }) => resolvePoiToolUse(input, context.user);
}
