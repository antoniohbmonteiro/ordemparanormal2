import { describe, expect, it } from "vitest";

import {
  adjustEquipmentUsesValue,
  EMPTY_EQUIPMENT_USES,
  readEquipmentUses,
} from "./equipment-uses";

describe("Equipment uses", () => {
  it("adjusts current value by one within its inline editing bounds", () => {
    expect(adjustEquipmentUsesValue({ value: 2, max: 3 }, -1)).toEqual({
      value: 1,
      max: 3,
    });
    expect(adjustEquipmentUsesValue({ value: 2, max: 3 }, 1)).toEqual({
      value: 3,
      max: 3,
    });
    expect(adjustEquipmentUsesValue({ value: 0, max: 3 }, -1)).toEqual({
      value: 0,
      max: 3,
    });
    expect(adjustEquipmentUsesValue({ value: 3, max: 3 }, 1)).toEqual({
      value: 3,
      max: 3,
    });
  });

  it("decreases an over-maximum value by one without rewriting max", () => {
    expect(adjustEquipmentUsesValue({ value: 5, max: 3 }, -1)).toEqual({
      value: 4,
      max: 3,
    });
    expect(adjustEquipmentUsesValue({ value: 5, max: 3 }, 1)).toEqual({
      value: 5,
      max: 3,
    });
  });

  it("reads non-negative integer values without clamping value to max", () => {
    expect(readEquipmentUses({ value: 5, max: 3 })).toEqual({ value: 5, max: 3 });
  });

  it.each([
    null,
    {},
    { value: -1, max: 3 },
    { value: 1.5, max: 3 },
    { value: 1, max: -1 },
    { value: 1, max: 3.5 },
  ])("rejects malformed uses (%s)", (value) => {
    expect(readEquipmentUses(value)).toBeNull();
  });

  it("creates an empty uses value", () => {
    expect(EMPTY_EQUIPMENT_USES).toEqual({ value: 0, max: 0 });
  });
});
