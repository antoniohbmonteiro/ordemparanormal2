export const EQUIPMENT_CATEGORIES = ["general", "weapon", "tool"] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export function isEquipmentCategory(value: unknown): value is EquipmentCategory {
  return EQUIPMENT_CATEGORIES.some((category) => category === value);
}
