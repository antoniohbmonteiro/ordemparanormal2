import { prepareRadio } from "../equipment/radio-session";
import type { RadioResponse } from "../../../application/equipment/radio-session";
import { SYSTEM_ID } from "../../../config/system-config";
import { readEquipmentUseForms } from "../../../core/equipment/equipment-use";
import type { LaboratoryResponse } from "../../../application/equipment/laboratory-session";
import { activeEquipmentAuthority, executeEquipmentUse, isEquipmentUseIntent, ownedEquipmentForUser,
  type EquipmentUseIntent, type ResolvedEquipmentUse } from "../equipment/execute-equipment-use";
import { prepareLaboratory } from "../equipment/laboratory-session";
import { classifyLaboratoryInteraction, classifyRadioInteraction, grantToolKnowledge, isPoiToolContext,
  type PoiToolContext, type ToolKnowledgeReceipt } from "./poi-tool-context";

export { isPoiToolContext, type PoiToolContext } from "./poi-tool-context";
export interface PoiToolIntent extends EquipmentUseIntent { readonly context: PoiToolContext }
export const POI_TOOL_USE_QUERY = `${SYSTEM_ID}.usePoiTool`;
const receipts = new Map<string, ToolKnowledgeReceipt>();
const manualOperations = new Map<string, { binding: string; authorityId: string; mechanic: "laboratory" | "radio" }>();
export const revealToolInformation = (context: PoiToolContext, resolved: ResolvedEquipmentUse,
  requester: foundry.documents.User) => grantToolKnowledge(context, resolved, requester);

export async function resolvePoiToolUse(input: PoiToolIntent, requester: foundry.documents.User): Promise<LaboratoryResponse | RadioResponse> {
  if (!activeEquipmentAuthority(requester)) return { status: "forbidden" };
  if (!isEquipmentUseIntent(input) || !isPoiToolContext(input.context)) return { status: "invalid" };
  const context = { sceneId: input.context.sceneId, itemUuid: input.context.itemUuid, runId: input.context.runId };
  const operationKey = `${requester.id}:${input.operationId}`;
  const binding = JSON.stringify([input.actorUuid, input.equipmentId, input.useFormId, context]);
  let manual = manualOperations.get(operationKey);
  if (manual && (manual.binding !== binding || manual.authorityId !== game.user?.id)) return { status: "invalid" };
  const owned = ownedEquipmentForUser(input, requester);
  const form = owned && readEquipmentUseForms((owned.equipment.system as { useForms?: unknown }).useForms)
    ?.find(use => use.id === input.useFormId);
  if (!manual && (form?.mechanic === "radio" || form?.mechanic === "laboratory")) {
    const prepared = form.mechanic === "radio"
      ? await prepareRadio({ ...input, context }, requester) : await prepareLaboratory({ ...input, context }, requester);
    if (prepared.status !== "unconfigured") return prepared;
    const concurrent = manualOperations.get(operationKey);
    if (concurrent && (concurrent.binding !== binding || concurrent.authorityId !== game.user?.id)) return { status: "invalid" };
    manual = concurrent ?? { binding, authorityId: game.user!.id, mechanic: prepared.mechanic };
    manualOperations.set(operationKey, manual);
  }
  if (manual) {
    const mechanic = manual.mechanic;
    return executeEquipmentUse(input, requester, JSON.stringify(context),
      async () => ({ newCount: 0, manual: true }), {
        expectedMechanic: mechanic,
        beforePayment: async resolved => {
          const interaction = mechanic === "radio" ? classifyRadioInteraction(context, resolved, requester)
            : classifyLaboratoryInteraction(context, resolved, requester);
          return interaction.status === "absent" ? null : { status: "invalid" };
        },
      });
  }
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
