import { describe, expect, it } from "vitest";

import {
  adjustDieStep,
  DIE_STEPS,
  isDieStep,
  NORMAL_DIE_STEPS,
} from "./die-step";

describe("DieStep", () => {
  it("defines the normal scale separately from exceptional d20", () => {
    expect(NORMAL_DIE_STEPS).toEqual([4, 6, 8, 10, 12]);
    expect(DIE_STEPS).toEqual([4, 6, 8, 10, 12, 20]);
  });

  it.each(DIE_STEPS)("accepts d%i", (step) => {
    expect(isDieStep(step)).toBe(true);
  });

  it.each([
    0,
    2,
    7,
    14,
    100,
    Number.NaN,
    "4",
    null,
    undefined,
    {},
  ])("rejects invalid value %j", (value) => {
    expect(isDieStep(value)).toBe(false);
  });
});

describe("die step adjustment", () => {
  it.each([
    [8, 1, 10],
    [6, 2, 10],
    [10, -1, 8],
    [10, -2, 6],
  ] as const)("adjusts d%i by %i to d%i", (die, adjustment, expected) => {
    expect(adjustDieStep(die, adjustment)).toBe(expected);
  });

  it.each([
    [4, -1, 4],
    [6, -4, 4],
    [12, 1, 12],
    [8, 100, 12],
  ] as const)("clamps d%i adjusted by %i to d%i", (die, adjustment, expected) => {
    expect(adjustDieStep(die, adjustment)).toBe(expected);
  });

  it.each([-4, -1, 0, 1, 4])("preserves d20 when adjusted by %i", (adjustment) => {
    expect(adjustDieStep(20, adjustment)).toBe(20);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-integer adjustment %j",
    (adjustment) => {
      expect(() => adjustDieStep(8, adjustment)).toThrow("integer");
    },
  );
});
