import { afterEach, describe, expect, it, vi } from "vitest";

import { useAbility } from "./use-ability";

afterEach(() => vi.unstubAllGlobals());

function createOwnedAbility(options: {
  cost: object;
  determination?: number;
  resource?: object | null;
  owner?: boolean;
}) {
  const itemUpdate = vi.fn().mockResolvedValue(undefined);
  const actorUpdate = vi.fn().mockResolvedValue(undefined);
  const actor = {
    isOwner: options.owner ?? true,
    system: {
      resources: {
        determination: { value: options.determination ?? 5, max: 5 },
      },
    },
    update: actorUpdate,
    getEmbeddedDocument: vi.fn(),
  } as unknown as foundry.documents.Actor;
  const ability = {
    id: "ability-1",
    type: "ability",
    actor,
    system: { cost: options.cost, resource: options.resource ?? null },
    update: itemUpdate,
  } as unknown as foundry.documents.Item;
  vi.mocked(actor.getEmbeddedDocument).mockReturnValue(ability);
  vi.stubGlobal("game", { user: { isGM: false } });
  return { actor, ability, actorUpdate, itemUpdate };
}

describe("useAbility", () => {
  it("pays determination once and refuses partial payment", async () => {
    const paid = createOwnedAbility({
      cost: { source: "determination", amount: 3 },
      determination: 5,
    });
    await expect(useAbility(paid.actor, paid.ability)).resolves.toEqual({
      status: "success",
      source: "determination",
      amount: 3,
      remaining: 2,
    });
    expect(paid.actorUpdate).toHaveBeenCalledOnce();

    const insufficient = createOwnedAbility({
      cost: { source: "determination", amount: 6 },
      determination: 5,
    });
    await expect(useAbility(insufficient.actor, insufficient.ability)).resolves
      .toMatchObject({ status: "insufficient", available: 5, required: 6 });
    expect(insufficient.actorUpdate).not.toHaveBeenCalled();
  });

  it("pays its own resource and reports missing state", async () => {
    const paid = createOwnedAbility({
      cost: { source: "resource", amount: 2 },
      resource: { value: 3, max: 4 },
    });
    await expect(useAbility(paid.actor, paid.ability)).resolves.toMatchObject({
      status: "success",
      source: "resource",
      remaining: 1,
    });
    expect(paid.itemUpdate).toHaveBeenCalledWith({ "system.resource.value": 1 });

    const missing = createOwnedAbility({
      cost: { source: "resource", amount: 1 },
    });
    await expect(useAbility(missing.actor, missing.ability)).resolves.toEqual({
      status: "invalid",
      reason: "missing-resource",
    });
  });

  it("refuses partial resource payment", async () => {
    const insufficient = createOwnedAbility({
      cost: { source: "resource", amount: 4 },
      resource: { value: 3, max: 5 },
    });

    await expect(useAbility(insufficient.actor, insufficient.ability)).resolves.toEqual({
      status: "insufficient",
      source: "resource",
      required: 4,
      available: 3,
    });
    expect(insufficient.itemUpdate).not.toHaveBeenCalled();
  });

  it("revalidates ownership and permission at the feature boundary", async () => {
    const forbidden = createOwnedAbility({
      cost: { source: "none", amount: 0 },
      owner: false,
    });
    await expect(useAbility(forbidden.actor, forbidden.ability)).resolves.toEqual({
      status: "forbidden",
    });

    const worldAbility = {
      ...forbidden.ability,
      actor: null,
    } as unknown as foundry.documents.Item;
    await expect(useAbility(forbidden.actor, worldAbility)).resolves.toEqual({
      status: "invalid",
      reason: "not-owned",
    });
  });
});
