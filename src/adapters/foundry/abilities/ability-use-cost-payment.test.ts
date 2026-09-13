import { describe, expect, it, vi } from "vitest";
import { payAbilityUseCostPlan } from "./ability-use-cost-payment";

describe("Ability use cost payment", () => {
  it("groups Actor balances before embedded Ability resources and skips empty writes", async () => {
    const calls: string[] = [];
    const actorUpdate = vi.fn(async () => { calls.push("actor"); });
    const itemUpdate = vi.fn(async () => { calls.push("items"); });
    const actor = { update: actorUpdate, updateEmbeddedDocuments: itemUpdate } as unknown as foundry.documents.Actor;
    await payAbilityUseCostPlan(actor, {
      claims: [],
      health: { amount: 2, remaining: 8 },
      determination: { amount: 3, remaining: 2 },
      abilityResources: { impetus: { amount: 1, remaining: 1 } },
    });
    expect(actorUpdate).toHaveBeenCalledExactlyOnceWith({
      "system.resources.health.value": 8,
      "system.resources.determination.value": 2,
    });
    expect(itemUpdate).toHaveBeenCalledExactlyOnceWith("Item", [{ _id: "impetus", "system.resource.value": 1 }]);
    expect(calls).toEqual(["actor", "items"]);

    actorUpdate.mockClear();
    itemUpdate.mockClear();
    await payAbilityUseCostPlan(actor, { claims: [], health: null, determination: null, abilityResources: {} });
    expect(actorUpdate).not.toHaveBeenCalled();
    expect(itemUpdate).not.toHaveBeenCalled();
  });
});
