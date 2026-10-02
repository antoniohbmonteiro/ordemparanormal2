import { EQUIPMENT_ITEM_TYPE } from "../../../config/system-config";
import {
  adjustEquipmentQuantity,
  readEquipmentQuantity,
  type EquipmentQuantityAdjustment,
} from "../../../core/equipment/equipment-quantity";

export type OwnedEquipmentQuantityAdjustmentResult =
  | { readonly status: "updated" | "unchanged"; readonly value: number }
  | { readonly status: "invalid" };

export async function adjustOwnedEquipmentQuantity(
  actor: foundry.documents.Actor,
  equipmentId: string,
  adjustment: EquipmentQuantityAdjustment,
): Promise<OwnedEquipmentQuantityAdjustmentResult> {
  const equipment = actor.getEmbeddedDocument("Item", equipmentId) as foundry.documents.Item | null;
  if (equipment?.type !== EQUIPMENT_ITEM_TYPE) return { status: "invalid" };
  const quantity = readEquipmentQuantity(
    (equipment.system as unknown as { readonly quantity?: unknown }).quantity,
  );
  if (quantity === null) return { status: "invalid" };
  const value = adjustEquipmentQuantity(quantity, adjustment);
  if (value === quantity) return { status: "unchanged", value };
  await equipment.update({ "system.quantity": value });
  return { status: "updated", value };
}
