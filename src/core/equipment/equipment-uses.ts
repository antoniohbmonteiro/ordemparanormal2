export interface EquipmentUsesData {
  readonly value: number;
  readonly max: number;
}

export const EMPTY_EQUIPMENT_USES: EquipmentUsesData = {
  value: 0,
  max: 0,
};

export type EquipmentUsesAdjustment = -1 | 1;

export function adjustEquipmentUsesValue(
  uses: EquipmentUsesData,
  adjustment: EquipmentUsesAdjustment,
): EquipmentUsesData {
  if (adjustment < 0) {
    return { ...uses, value: Math.max(0, uses.value - 1) };
  }
  if (uses.value >= uses.max) return uses;
  return { ...uses, value: uses.value + 1 };
}

export function readEquipmentUses(value: unknown): EquipmentUsesData | null {
  if (!value || typeof value !== "object") return null;

  const uses = value as Partial<EquipmentUsesData>;
  return Number.isInteger(uses.value) &&
    Number(uses.value) >= 0 &&
    Number.isInteger(uses.max) &&
    Number(uses.max) >= 0
    ? { value: Number(uses.value), max: Number(uses.max) }
    : null;
}
