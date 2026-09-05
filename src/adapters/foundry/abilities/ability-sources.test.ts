import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  InvalidAbilityGrantError,
  createAbilitySnapshot,
  readOwnedAbilitySourceUuid,
  readProfileGrantedAbilityFlag,
  resolveAbilityGrantSources,
} from "./ability-sources";

const SOURCE_UUID =
  "Compendium.ordemparanormal2.abilities.Item.ability000000008";

function ability(overrides: Record<string, unknown> = {}) {
  const value = {
    id: "ability-id",
    uuid: SOURCE_UUID,
    name: "Ímpeto",
    img: null,
    type: "ability",
    isEmbedded: false,
    system: { description: "", cost: { source: "none", amount: 0 }, resource: null },
    effects: [],
    ...overrides,
  };
  return {
    ...value,
    toObject: () => ({ system: value.system, effects: value.effects }),
  } as unknown as foundry.documents.Item;
}

describe("Ability source provenance", () => {
  beforeEach(() => {
    vi.stubGlobal("foundry", { utils: { deepClone: structuredClone } });
  });

  it("reads source identity in the required precedence order", () => {
    const granted = ability({
      flags: {
        ordemparanormal2: {
          sourceUuid: "Item.flag-source",
          profileGrant: {
            profileItemId: "profile-id",
            abilityUuid: SOURCE_UUID,
          },
        },
      },
      _stats: {
        compendiumSource: "Compendium.old.Item.source",
        duplicateSource: "Item.duplicate",
      },
    });
    expect(readProfileGrantedAbilityFlag(granted)).toEqual({
      profileItemId: "profile-id",
      abilityUuid: SOURCE_UUID,
    });
    expect(readOwnedAbilitySourceUuid(granted)).toBe(SOURCE_UUID);

    expect(
      readOwnedAbilitySourceUuid(
        ability({ flags: { ordemparanormal2: { sourceUuid: "Item.flag" } } }),
      ),
    ).toBe("Item.flag");
    expect(
      readOwnedAbilitySourceUuid(
        ability({ _stats: { compendiumSource: "Compendium.pack.Item.id" } }),
      ),
    ).toBe("Compendium.pack.Item.id");
    expect(
      readOwnedAbilitySourceUuid(
        ability({ _stats: { duplicateSource: "Item.original" } }),
      ),
    ).toBe("Item.original");
  });

  it("creates a portable deep copy with explicit Profile-grant provenance", () => {
    const source = ability({
      effects: [{ name: "Effect" }],
    });
    const snapshot = createAbilitySnapshot(source, {
      profileItemId: "profile-id",
      abilityUuid: SOURCE_UUID,
    });

    expect(snapshot).toEqual({
      name: "Ímpeto",
      img: "icons/svg/item-bag.svg",
      type: "ability",
      system: { description: "", cost: { source: "none", amount: 0 }, resource: null },
      effects: [{ name: "Effect" }],
      flags: {
        ordemparanormal2: {
          sourceUuid: SOURCE_UUID,
          profileGrant: {
            profileItemId: "profile-id",
            abilityUuid: SOURCE_UUID,
          },
        },
      },
    });
    expect(snapshot.system).not.toBe(source.system);
  });

  it.each([
    [null, "missing"],
    [ability({ type: "profile" }), "wrong-type"],
    [ability({ isEmbedded: true }), "embedded"],
  ] as const)("rejects invalid grant sources (%s)", async (resolved, reason) => {
    vi.stubGlobal("fromUuid", vi.fn().mockResolvedValue(resolved));
    await expect(resolveAbilityGrantSources([{ uuid: SOURCE_UUID }])).rejects.toMatchObject({
      name: InvalidAbilityGrantError.name,
      uuid: SOURCE_UUID,
      reason,
    });
  });
});
