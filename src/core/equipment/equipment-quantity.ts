export type EquipmentQuantityAdjustment = -1 | 1;

export function isEquipmentQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function readEquipmentQuantity(value: unknown): number | null {
  return isEquipmentQuantity(value) ? value : null;
}

export function adjustEquipmentQuantity(
  quantity: number,
  adjustment: EquipmentQuantityAdjustment,
): number {
  if (!isEquipmentQuantity(quantity)) throw new Error("Invalid Equipment quantity.");
  return adjustment < 0
    ? Math.max(0, quantity - 1)
    : Math.min(Number.MAX_SAFE_INTEGER, quantity + 1);
}
