import { describe, expect, it } from "vitest";

import { normalizeAbilityCost, readAbilityCost } from "./ability-cost";

describe("Ability cost", () => {
  it("validates consistent persisted costs", () => {
    expect(readAbilityCost({ source: "determination", amount: 2 })).toEqual({
      source: "determination",
      amount: 2,
    });
    expect(readAbilityCost({ source: "resource", amount: 1 })).toEqual({
      source: "resource",
      amount: 1,
    });
    expect(readAbilityCost({ source: "none", amount: 1 })).toBeNull();
  });

  it("normalizes amounts and forces free costs to zero", () => {
    expect(normalizeAbilityCost("none", 8)).toEqual({ source: "none", amount: 0 });
    expect(normalizeAbilityCost("determination", 3)).toEqual({
      source: "determination",
      amount: 3,
    });
    expect(normalizeAbilityCost("resource", 2)).toEqual({
      source: "resource",
      amount: 2,
    });
  });
});
