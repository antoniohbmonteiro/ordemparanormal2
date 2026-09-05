import { describe, expect, it } from "vitest";

import { EQUIPMENT_CATEGORIES, isEquipmentCategory } from "./equipment-category";

describe("Equipment category", () => {
  it("accepts the known categories", () => {
    for (const category of EQUIPMENT_CATEGORIES) {
      expect(isEquipmentCategory(category)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isEquipmentCategory("weaponry")).toBe(false);
    expect(isEquipmentCategory(undefined)).toBe(false);
    expect(isEquipmentCategory(null)).toBe(false);
  });
});
