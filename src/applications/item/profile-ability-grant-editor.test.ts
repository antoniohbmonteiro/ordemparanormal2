import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  evaluateProfileAbilityGrantDrop,
  persistProfileAbilityGrants,
  removeProfileAbilityGrant,
  resolveProfileAbilityGrantView,
} from "./profile-ability-grant-editor";

const ABILITY_UUID =
  "Compendium.ordemparanormal2.abilities.Item.ability000000008";

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-id",
    uuid: ABILITY_UUID,
    name: "Ímpeto",
    img: "icons/svg/item-bag.svg",
    type: "ability",
    isEmbedded: false,
    actor: null,
    system: {},
    toObject: vi.fn().mockReturnValue({ system: {}, effects: [] }),
    update: vi.fn(),
    ...overrides,
  } as unknown as foundry.documents.Item;
}

describe("Profile Ability grant editor", () => {
  beforeEach(() => {
    vi.stubGlobal("foundry", { utils: { deepClone: structuredClone } });
  });

  it("accepts world and compendium Abilities while preserving declaration order", () => {
    const world = item({ uuid: "Item.worldAbility" });
    const compendium = item();

    const first = evaluateProfileAbilityGrantDrop(world, []);
    expect(first).toEqual({
      status: "accepted",
      grants: [{ uuid: "Item.worldAbility" }],
    });
    if (first.status !== "accepted") throw new Error("expected acceptance");
    expect(evaluateProfileAbilityGrantDrop(compendium, first.grants)).toEqual({
      status: "accepted",
      grants: [{ uuid: "Item.worldAbility" }, { uuid: ABILITY_UUID }],
    });
  });

  it("rejects the wrong Item type and embedded Ability sources", () => {
    expect(evaluateProfileAbilityGrantDrop(item({ type: "profile" }), [])).toEqual({
      status: "wrong-type",
    });
    expect(evaluateProfileAbilityGrantDrop(item({ isEmbedded: true }), [])).toEqual({
      status: "embedded",
    });
  });

  it("ignores duplicate drops and removes declarations by UUID", () => {
    const grants = [{ uuid: ABILITY_UUID }, { uuid: "Item.other" }];
    expect(evaluateProfileAbilityGrantDrop(item(), grants)).toEqual({
      status: "duplicate",
    });
    expect(removeProfileAbilityGrant(grants, ABILITY_UUID)).toEqual([
      { uuid: "Item.other" },
    ]);
  });

  it("shows resolved sources and leaves broken references removable", async () => {
    await expect(
      resolveProfileAbilityGrantView(
        { uuid: ABILITY_UUID },
        vi.fn().mockResolvedValue(item()),
      ),
    ).resolves.toEqual({
      uuid: ABILITY_UUID,
      name: "Ímpeto",
      img: "icons/svg/item-bag.svg",
      available: true,
    });
    await expect(
      resolveProfileAbilityGrantView(
        { uuid: "Compendium.missing.Item.nope" },
        vi.fn().mockResolvedValue(null),
      ),
    ).resolves.toEqual({
      uuid: "Compendium.missing.Item.nope",
      name: "Compendium.missing.Item.nope",
      img: "icons/svg/hazard.svg",
      available: false,
    });
  });

  it("updates non-embedded declarations without reconciling an Actor", async () => {
    const profile = item({ type: "profile", uuid: "Item.profile" });
    await persistProfileAbilityGrants(profile, [{ uuid: ABILITY_UUID }]);
    expect(profile.update).toHaveBeenCalledWith({
      "system.abilityGrants": [{ uuid: ABILITY_UUID }],
    });
  });

  it("reconciles immediately when the Profile is embedded in an Agent", async () => {
    const ability = item();
    vi.stubGlobal("fromUuid", vi.fn().mockResolvedValue(ability));
    const embeddedItems: foundry.documents.Item[] = [];
    const actor = {
      type: "agent",
      getEmbeddedCollection: vi.fn().mockReturnValue(embeddedItems),
      updateEmbeddedDocuments: vi.fn().mockImplementation(async () => [profile]),
      createEmbeddedDocuments: vi.fn().mockImplementation(async (_type, sources) => {
        embeddedItems.push(...sources);
        return sources;
      }),
      deleteEmbeddedDocuments: vi.fn(),
    } as unknown as foundry.documents.Actor;
    const profile = item({
      id: "profile-id",
      type: "profile",
      uuid: "Actor.agent.Item.profile-id",
      actor,
      system: { abilityGrants: [] },
    });
    embeddedItems.push(profile);

    await persistProfileAbilityGrants(profile, [{ uuid: ABILITY_UUID }]);

    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledOnce();
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
      "Item",
      [expect.objectContaining({ type: "ability" })],
    );
  });
});
