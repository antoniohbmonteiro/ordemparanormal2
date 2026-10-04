import { runRadioSession } from "../equipment/radio-session";
import { resumeRadio, RADIO_RESUME_QUERY } from "../../adapters/foundry/equipment/radio-session";
import type { RadioResponse } from "../../application/equipment/radio-session";
import { executeEquipmentUse, type EquipmentUseIntent, type EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";
import { POI_TOOL_USE_QUERY, resolvePoiToolUse, type PoiToolContext } from "../../adapters/foundry/points-of-interest/use-poi-tool";
import { useEquipment } from "../equipment/use-equipment";
import type { LaboratoryResponse } from "../../application/equipment/laboratory-session";
import { runLaboratorySession } from "../equipment/laboratory-session";
import { readEquipmentUseForms } from "../../core/equipment/equipment-use";

export async function useInvestigationTool(actor: foundry.documents.Actor, equipmentId: string, context: PoiToolContext,
  stillSelected: () => boolean = () => true, signal?: AbortSignal) {
  const dispatch = async (intent: EquipmentUseIntent): Promise<EquipmentUseResult> => {
    if (!stillSelected()) return { status: "forbidden" };
    const gm = game.users.activeGM;
    if (!gm) {
      const equipment = actor.getEmbeddedDocument("Item", intent.equipmentId) as foundry.documents.Item | null;
      if (readEquipmentUseForms((equipment?.system as { useForms?: unknown } | undefined)?.useForms)
        ?.find(form => form.id === intent.useFormId)?.mechanic === "laboratory"
        || readEquipmentUseForms((equipment?.system as { useForms?: unknown } | undefined)?.useForms)
          ?.find(form => form.id === intent.useFormId)?.mechanic === "radio") return { status: "gmRequired" };
      const result = await executeEquipmentUse(intent, game.user, JSON.stringify(context));
      return result.status === "success" ? { ...result, manual: true } : result;
    }
    const equipment = actor.getEmbeddedDocument("Item", intent.equipmentId) as foundry.documents.Item | null;
    const mechanic = readEquipmentUseForms((equipment?.system as { useForms?: unknown } | undefined)?.useForms)
      ?.find(form => form.id === intent.useFormId)?.mechanic;
    const resumed: RadioResponse | null = mechanic === "radio" ? (gm.id === game.user.id
      ? await resumeRadio({ ...intent, context }, game.user)
      : await gm.query(RADIO_RESUME_QUERY, { ...intent, context }, { timeout: 10000 }) as RadioResponse | null) : null;
    const result: LaboratoryResponse | RadioResponse = resumed ?? (gm.id === game.user.id ? await resolvePoiToolUse({ ...intent, context }, game.user)
      : await gm.query(POI_TOOL_USE_QUERY, { ...intent, context }, { timeout: 10000 }) as LaboratoryResponse | RadioResponse);
    if (result.status === "radio") return result.terminal ?? await runRadioSession(actor, result.view, gm.id, stillSelected, signal);
    if (result.status !== "laboratory") return result;
    if (result.terminal) return result.terminal;
    return runLaboratorySession(result.view, gm.id, stillSelected, signal);
  };
  return useEquipment(actor, equipmentId, dispatch, JSON.stringify(context));
}
