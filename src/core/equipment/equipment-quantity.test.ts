import { describe, expect, it } from "vitest";
import { adjustEquipmentQuantity, isEquipmentQuantity, readEquipmentQuantity } from "./equipment-quantity";

describe("Equipment quantity", () => {
  it.each([0, 1, 2, Number.MAX_SAFE_INTEGER])("reads the safe nonnegative integer %s", value => {
    expect(isEquipmentQuantity(value)).toBe(true);
    expect(readEquipmentQuantity(value)).toBe(value);
  });
  it.each([null, undefined, "2", true, {}, [], -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "does not invent a counter for %s", value => {
      expect(isEquipmentQuantity(value)).toBe(false);
      expect(readEquipmentQuantity(value)).toBeNull();
    },
  );
  it("adjusts one unit and preserves the lower and upper boundaries", () => {
    expect(adjustEquipmentQuantity(2, -1)).toBe(1);
    expect(adjustEquipmentQuantity(2, 1)).toBe(3);
    expect(adjustEquipmentQuantity(1, -1)).toBe(0);
    expect(adjustEquipmentQuantity(0, -1)).toBe(0);
    expect(adjustEquipmentQuantity(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => adjustEquipmentQuantity(-1, 1)).toThrow();
  });
});
