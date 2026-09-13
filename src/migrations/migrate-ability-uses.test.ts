import { describe, expect, it, vi } from "vitest";

import {
  migrateAbilityUses,
  migrateLegacyAbilitySystem,
} from "./migrate-ability-uses";

describe("Ability uses migration", () => {
  it("converts only meaningful structurally valid legacy costs", () => {
    expect(migrateLegacyAbilitySystem({ cost: { source: "determination", amount: 2 } }))
      .toEqual([expect.objectContaining({ id: "legacy-use", minimumLevel: null })]);
    expect(migrateLegacyAbilitySystem({ cost: { source: "none", amount: 0 } })).toEqual([]);
    expect(migrateLegacyAbilitySystem({ cost: { source: "resource", amount: 2 } })).toEqual([]);
    expect(migrateLegacyAbilitySystem({
      cost: { source: "resource", amount: 2 }, resource: { value: 0, max: 3 },
    })[0]?.cost).toEqual({ source: "resource", amount: 2 });
  });

  it("preserves an existing valid collection as authoritative", () => {
    const uses = [{
      id: "current", name: "Atual", description: "",
      cost: { source: "none", amount: 0 }, minimumLevel: null,
    }];
    expect(migrateLegacyAbilitySystem({
      uses, cost: { source: "determination", amount: 3 },
    })).toEqual(uses);
  });

  it("updates world and embedded Abilities sequentially", async () => {
    const calls: string[] = [];
    const item = (id: string, type = "ability") => ({
      id, type,
      toObject: () => ({ system: { cost: { source: "none", amount: 0 }, resource: null } }),
      update: vi.fn(async () => { calls.push(id); }),
    });
    const world = item("world");
    const embedded = item("embedded");
    const actor = { getEmbeddedCollection: () => [embedded] };
    await migrateAbilityUses(
      [world] as unknown as foundry.documents.Item[],
      [actor] as unknown as foundry.documents.Actor[],
    );
    expect(calls).toEqual(["world", "embedded"]);
    expect(world.update).toHaveBeenCalledWith({
      "system.uses": [], "system.-=cost": null,
    });
  });
});
