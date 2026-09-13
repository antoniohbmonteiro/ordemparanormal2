import { afterEach, describe, expect, it, vi } from "vitest";

import { useAbility } from "./use-ability";

afterEach(() => vi.unstubAllGlobals());

function createOwnedAbility(options: {
  cost: object;
  minimumLevel?: number | null;
  level?: number;
  determination?: number;
  resource?: object | null;
  owner?: boolean;
}) {
  const itemUpdate = vi.fn().mockResolvedValue(undefined);
  const actorUpdate = vi.fn().mockResolvedValue(undefined);
  const actor = {
    isOwner: options.owner ?? true,
    system: {
      level: options.level ?? 2,
      resources: { determination: { value: options.determination ?? 5, max: 5 } },
    },
    update: actorUpdate,
  } as unknown as foundry.documents.Actor;
  const use = {
    id: "use-1", name: "Forma", description: "<p>Efeito</p>",
    cost: options.cost, minimumLevel: options.minimumLevel ?? null,
  };
  const ability = {
    id: "ability-1", type: "ability", actor,
    system: { uses: [use], resource: options.resource ?? null },
    update: itemUpdate,
  } as unknown as foundry.documents.Item;
  vi.stubGlobal("game", { user: { isGM: false } });
  return { actor, ability, use, actorUpdate, itemUpdate };
}

describe("useAbility", () => {
  it("pays determination once and returns the executed snapshot", async () => {
    const paid = createOwnedAbility({ cost: { source: "determination", amount: 3 }, determination: 5 });
    await expect(useAbility(paid.actor, paid.ability, "use-1")).resolves.toMatchObject({
      status: "success", use: paid.use, source: "determination", amount: 3, remaining: 2,
    });
    expect(paid.actorUpdate).toHaveBeenCalledOnce();

    const insufficient = createOwnedAbility({ cost: { source: "determination", amount: 6 }, determination: 5 });
    await expect(useAbility(insufficient.actor, insufficient.ability, "use-1")).resolves.toMatchObject({ status: "insufficient", available: 5, required: 6 });
    expect(insufficient.actorUpdate).not.toHaveBeenCalled();
  });

  it("pays its own resource and refuses partial payment", async () => {
    const paid = createOwnedAbility({ cost: { source: "resource", amount: 2 }, resource: { value: 3, max: 4 } });
    await expect(useAbility(paid.actor, paid.ability, "use-1")).resolves.toMatchObject({ status: "success", source: "resource", remaining: 1 });
    expect(paid.itemUpdate).toHaveBeenCalledWith({ "system.resource.value": 1 });

    const insufficient = createOwnedAbility({ cost: { source: "resource", amount: 4 }, resource: { value: 3, max: 5 } });
    await expect(useAbility(insufficient.actor, insufficient.ability, "use-1")).resolves.toEqual({ status: "insufficient", source: "resource", required: 4, available: 3 });
    expect(insufficient.itemUpdate).not.toHaveBeenCalled();
  });

  it("enforces minimum level and resolves the stable id", async () => {
    const locked = createOwnedAbility({ cost: { source: "none", amount: 0 }, minimumLevel: 6, level: 5 });
    await expect(useAbility(locked.actor, locked.ability, "use-1")).resolves.toEqual({ status: "locked", currentLevel: 5, requiredLevel: 6 });
    await expect(useAbility(locked.actor, locked.ability, "missing")).resolves.toEqual({ status: "invalid", reason: "missing-use" });
  });

  it("reports malformed selected costs separately from malformed collections", async () => {
    const malformed = createOwnedAbility({ cost: { source: "none", amount: 2 } });
    await expect(useAbility(malformed.actor, malformed.ability, "use-1")).resolves.toEqual({
      status: "invalid", reason: "malformed-cost",
    });
  });

  it("revalidates ownership, permission and collection", async () => {
    const forbidden = createOwnedAbility({ cost: { source: "none", amount: 0 }, owner: false });
    await expect(useAbility(forbidden.actor, forbidden.ability, "use-1")).resolves.toEqual({ status: "forbidden" });
    const worldAbility = { ...forbidden.ability, actor: null } as unknown as foundry.documents.Item;
    await expect(useAbility(forbidden.actor, worldAbility, "use-1")).resolves.toEqual({ status: "invalid", reason: "not-owned" });
  });
});
