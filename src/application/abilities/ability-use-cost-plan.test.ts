import { describe, expect, it } from "vitest";
import { resolveAbilityUseCostPlan } from "./ability-use-cost-plan";

describe("Ability use cost plan", () => {
  it("aggregates Actor and per-Ability costs without mutating balances", () => {
    const balances = { health: 8, determination: 5, abilityResources: { impetus: 3 } };
    const result = resolveAbilityUseCostPlan([
      { abilityId: "focus", useId: "a", cost: { source: "determination", amount: 2 } },
      { abilityId: "focus2", useId: "b", cost: { source: "determination", amount: 3 } },
      { abilityId: "impetus", useId: "c", cost: { source: "resource", amount: 2 } },
      { abilityId: "free", useId: "d", cost: { source: "none", amount: 0 } },
    ], balances);
    expect(result).toMatchObject({
      status: "success",
      plan: {
        health: null,
        determination: { amount: 5, remaining: 0 },
        abilityResources: { impetus: { amount: 2, remaining: 1 } },
      },
    });
    expect(balances).toEqual({ health: 8, determination: 5, abilityResources: { impetus: 3 } });
  });

  it("rejects the complete aggregate when an account is short", () => {
    expect(resolveAbilityUseCostPlan([
      { abilityId: "a", useId: "a", cost: { source: "determination", amount: 3 } },
      { abilityId: "b", useId: "b", cost: { source: "determination", amount: 3 } },
    ], { health: 10, determination: 5, abilityResources: {} })).toEqual({
      status: "insufficient", source: "determination", required: 6, available: 5,
    });
  });
});
