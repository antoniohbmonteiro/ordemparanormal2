import { executeEquipmentUse, type EquipmentUseIntent, type EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";
import { POI_TOOL_USE_QUERY, resolvePoiToolUse, type PoiToolContext } from "../../adapters/foundry/points-of-interest/use-poi-tool";
import { useEquipment } from "../equipment/use-equipment";

export async function useInvestigationTool(actor: foundry.documents.Actor, equipmentId: string, context: PoiToolContext,
  stillSelected: () => boolean = () => true) {
  const dispatch = async (intent: EquipmentUseIntent): Promise<EquipmentUseResult> => {
    if (!stillSelected()) return { status: "forbidden" };
    const gm = game.users.activeGM;
    if (!gm) {
      const result = await executeEquipmentUse(intent, game.user, JSON.stringify(context));
      return result.status === "success" ? { ...result, manual: true } : result;
    }
    if (gm.id === game.user.id) return resolvePoiToolUse({ ...intent, context }, game.user);
    return await gm.query(POI_TOOL_USE_QUERY, { ...intent, context }, { timeout: 10000 }) as EquipmentUseResult;
  };
  return useEquipment(actor, equipmentId, dispatch, JSON.stringify(context));
}
