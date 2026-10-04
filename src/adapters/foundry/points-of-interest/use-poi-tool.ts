import { prepareRadio } from "../equipment/radio-session";
import type { RadioResponse } from "../../../application/equipment/radio-session";
import { SYSTEM_ID } from "../../../config/system-config";
import { readEquipmentUseForms } from "../../../core/equipment/equipment-use";
import type { LaboratoryResponse } from "../../../application/equipment/laboratory-session";
import { activeEquipmentAuthority, executeEquipmentUse, isEquipmentUseIntent, ownedEquipmentForUser,
  type EquipmentUseIntent, type ResolvedEquipmentUse } from "../equipment/execute-equipment-use";
import { prepareLaboratory } from "../equipment/laboratory-session";
import { grantToolKnowledge, isPoiToolContext, type PoiToolContext, type ToolKnowledgeReceipt } from "./poi-tool-context";

export { isPoiToolContext, type PoiToolContext } from "./poi-tool-context";
export interface PoiToolIntent extends EquipmentUseIntent { readonly context: PoiToolContext }
export const POI_TOOL_USE_QUERY = `${SYSTEM_ID}.usePoiTool`;
const receipts = new Map<string, ToolKnowledgeReceipt>();
export const revealToolInformation = (context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User) => grantToolKnowledge(context, resolved, requester);

export function resolvePoiToolUse(input: PoiToolIntent, requester: foundry.documents.User): Promise<LaboratoryResponse | RadioResponse> {
  if (!activeEquipmentAuthority(requester)) return Promise.resolve({ status: "forbidden" });
  if (!isEquipmentUseIntent(input) || !isPoiToolContext(input.context)) return Promise.resolve({ status: "invalid" });
  const context = { sceneId: input.context.sceneId, itemUuid: input.context.itemUuid, runId: input.context.runId };
  const owned = ownedEquipmentForUser(input, requester);
  const form = owned && readEquipmentUseForms((owned.equipment.system as { useForms?: unknown }).useForms)
    ?.find(use => use.id === input.useFormId);
  if (form?.mechanic === "radio") return prepareRadio({ ...input, context }, requester);
  if (form?.mechanic === "laboratory") return prepareLaboratory({ ...input, context }, requester);
  const key = JSON.stringify([requester.id, input.operationId, input.actorUuid, input.equipmentId, input.useFormId, context]);
  const receipt = receipts.get(key) ?? {};
  receipts.set(key, receipt);
  return executeEquipmentUse(input, requester, JSON.stringify(context),
    resolved => grantToolKnowledge(context, resolved, requester, undefined, receipt));
}
export function registerPoiToolUseQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[POI_TOOL_USE_QUERY] =
    (input: PoiToolIntent, context: { user: foundry.documents.User }) => resolvePoiToolUse(input, context.user);
}
