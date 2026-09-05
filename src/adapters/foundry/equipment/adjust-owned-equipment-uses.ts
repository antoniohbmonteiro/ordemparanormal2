import { EQUIPMENT_ITEM_TYPE } from "../../../config/system-config";
import {
  adjustEquipmentUsesValue,
  readEquipmentUses,
  type EquipmentUsesAdjustment,
} from "../../../core/equipment/equipment-uses";

export type OwnedEquipmentUsesAdjustmentResult =
  | { readonly status: "updated"; readonly value: number }
  | { readonly status: "unchanged"; readonly value: number }
  | { readonly status: "invalid" };

export async function adjustOwnedEquipmentUses(
  actor: foundry.documents.Actor,
  equipmentId: string,
  adjustment: EquipmentUsesAdjustment,
): Promise<OwnedEquipmentUsesAdjustmentResult> {
  const equipment = actor.getEmbeddedDocument(
    "Item",
    equipmentId,
  ) as foundry.documents.Item | null;
  if (equipment?.type !== EQUIPMENT_ITEM_TYPE) return { status: "invalid" };

  const uses = readEquipmentUses(
    (equipment.system as unknown as { readonly uses?: unknown }).uses,
  );
  if (!uses) return { status: "invalid" };

  const adjusted = adjustEquipmentUsesValue(uses, adjustment);
  if (adjusted.value === uses.value) {
    return { status: "unchanged", value: uses.value };
  }

  await equipment.update({ "system.uses.value": adjusted.value });
  return { status: "updated", value: adjusted.value };
}
