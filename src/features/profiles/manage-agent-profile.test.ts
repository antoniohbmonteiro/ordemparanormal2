import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentProfileConflictError,
  clearAgentProfile,
  createProfileSnapshot,
  getAgentProfile,
  setAgentProfile,
  updateProfileAccentColor,
  updateAgentProfileAbilityGrants,
} from "./manage-agent-profile";

const IMPETUS_UUID =
  "Compendium.ordemparanormal2.abilities.Item.ability000000008";
const EVALUATION_UUID =
  "Compendium.ordemparanormal2.abilities.Item.ability000000002";

function abilitySource(uuid: string, name: string) {
  return {
    id: uuid.slice(-16),
    uuid,
    name,
    img: "icons/svg/item-bag.svg",
    type: "ability",
    isEmbedded: false,
    actor: null,
    system: {
      description: "",
      cost: { source: "none", amount: 0 },
      resource: null,
    },
    toObject: () => ({
      system: {
        description: "",
        cost: { source: "none", amount: 0 },
        resource: null,
      },
      effects: [],
    }),
  } as unknown as foundry.documents.Item;
}

function profile(
  id: string,
  name = "Executor",
  grants: readonly string[] = [],
  accentColor?: string,
) {
  const value = {
    id,
    uuid: `Item.${id}`,
    name,
    img: "icons/svg/item-bag.svg",
    type: "profile",
    actor: null,
    system: {
      ...(accentColor ? { accentColor } : {}),
      abilityGrants: grants.map((uuid) => ({ uuid })),
    },
    update: vi.fn(async (update: Record<string, unknown>) => {
      if ("system.accentColor" in update) {
        (value.system as { accentColor?: unknown }).accentColor =
          update["system.accentColor"];
      }
      return value;
    }),
  } as unknown as foundry.documents.Item;
  return value;
}

function ownedAbility(
  id: string,
  sourceUuid: string,
  profileItemId?: string,
) {
  return {
    id,
    uuid: `Actor.agent.Item.${id}`,
    name: "Habilidade",
    img: "icons/svg/item-bag.svg",
    type: "ability",
    actor: {},
    system: { resource: { value: 2, max: 3 } },
    flags: {
      ordemparanormal2: {
        sourceUuid,
        ...(profileItemId
          ? { profileGrant: { profileItemId, abilityUuid: sourceUuid } }
          : {}),
      },
    },
  } as unknown as foundry.documents.Item;
}

function actor(initialItems: foundry.documents.Item[], accentColor?: string) {
  const items = [...initialItems];
  let createdIndex = 0;
  const system: { appearance: { accentColor?: string } } = {
    appearance: accentColor ? { accentColor } : {},
  };
  const value = {
    type: "agent",
    system,
    update: vi.fn().mockImplementation(
      async (update: Record<string, unknown>) => {
        if ("system.appearance.accentColor" in update) {
          (value.system.appearance as { accentColor?: unknown }).accentColor =
            update["system.appearance.accentColor"];
        }
        return value;
      },
    ),
    getEmbeddedCollection: vi.fn().mockImplementation(() => items),
    createEmbeddedDocuments: vi.fn().mockImplementation(
      async (_type: string, sources: readonly Record<string, unknown>[]) =>
        sources.map((source) => {
          const item = {
            ...structuredClone(source),
            id: `created-${++createdIndex}`,
            uuid: `Actor.agent.Item.created-${createdIndex}`,
            actor: value,
          } as unknown as foundry.documents.Item;
          items.push(item);
          return item;
        }),
    ),
    updateEmbeddedDocuments: vi.fn().mockImplementation(
      async (_type: string, updates: readonly Record<string, unknown>[]) =>
        updates.map((update) => {
          const item = items.find((entry) => entry.id === update._id);
          if (!item) throw new Error("missing embedded item");
          if ("system.abilityGrants" in update) {
            (item.system as { abilityGrants: unknown }).abilityGrants =
              update["system.abilityGrants"];
          }
          for (const [key, next] of Object.entries(update)) {
            if (key !== "_id" && key !== "system.abilityGrants") {
              Object.assign(item, { [key]: structuredClone(next) });
            }
          }
          return item;
        }),
    ),
    deleteEmbeddedDocuments: vi.fn().mockImplementation(
      async (_type: string, ids: readonly string[]) => {
        for (const id of ids) {
          const index = items.findIndex((entry) => entry.id === id);
          if (index >= 0) items.splice(index, 1);
        }
        return [];
      },
    ),
  };
  return {
    value: value as unknown as typeof value & foundry.documents.Actor,
    items,
  };
}

describe("manageAgentProfile", () => {
  beforeEach(() => {
    const sources = new Map([
      [IMPETUS_UUID, abilitySource(IMPETUS_UUID, "Ímpeto")],
      [EVALUATION_UUID, abilitySource(EVALUATION_UUID, "Avaliação")],
    ]);
    vi.stubGlobal("fromUuid", vi.fn((uuid: string) => sources.get(uuid) ?? null));
    vi.stubGlobal("foundry", {
      utils: { deepClone: structuredClone },
    });
  });

  it("copies only portable Profile fields and de-duplicates grants", () => {
    const source = Object.assign(
      profile(
        "source",
        "Executor",
        [IMPETUS_UUID, IMPETUS_UUID],
        "#ae2c12",
      ),
      { folder: "folder-id", flags: { module: true }, ownership: { default: 3 } },
    );

    expect(createProfileSnapshot(source)).toEqual({
      name: "Executor",
      img: "icons/svg/item-bag.svg",
      type: "profile",
      system: {
        accentColor: "#AE2C12",
        abilityGrants: [{ uuid: IMPETUS_UUID }],
      },
    });
  });

  it("seeds the first assigned Profile color only after assignment succeeds", async () => {
    const configured = actor([]);

    await setAgentProfile(
      configured.value,
      profile("source", "Analista", [], "#4176BA"),
    );

    expect(configured.value.update).toHaveBeenCalledWith({
      "system.appearance.accentColor": "#4176BA",
    });
    expect(
      vi.mocked(configured.value.createEmbeddedDocuments).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(configured.value.update).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not overwrite a persisted Agent accent when replacing its Profile", async () => {
    const current = profile("profile-id", "Executor", [], "#AE2C12");
    const configured = actor([current], "#123456");
    (current as unknown as { actor: foundry.documents.Actor }).actor =
      configured.value;

    await setAgentProfile(
      configured.value,
      profile("source", "Analista", [], "#4176BA"),
    );

    expect(configured.value.update).not.toHaveBeenCalled();
    expect(configured.value.system.appearance.accentColor).toBe("#123456");
  });

  it("materializes the old implicit Profile seed before replacement or removal", async () => {
    const current = profile("profile-id", "Analista", [], "#4176BA");
    const configured = actor([current]);
    (current as unknown as { actor: foundry.documents.Actor }).actor =
      configured.value;

    await setAgentProfile(
      configured.value,
      profile("source", "Executor", [], "#AE2C12"),
    );

    expect(configured.value.system.appearance.accentColor).toBe("#4176BA");
    expect(
      vi.mocked(configured.value.update).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(configured.value.updateEmbeddedDocuments).mock
        .invocationCallOrder[0] ?? 0,
    );

    const removable = profile("remove-id", "Vigilante", [], "#4B7E2F");
    const removal = actor([removable]);
    (removable as unknown as { actor: foundry.documents.Actor }).actor =
      removal.value;
    await clearAgentProfile(removal.value);
    expect(removal.value.system.appearance.accentColor).toBe("#4B7E2F");
    expect(
      vi.mocked(removal.value.update).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(removal.value.deleteEmbeddedDocuments).mock
        .invocationCallOrder[0] ?? 0,
    );
  });

  it("preserves an embedded legacy Profile seed before editing its color", async () => {
    const current = profile("profile-id", "Analista", [], "#4176BA");
    const configured = actor([current]);
    (current as unknown as { actor: foundry.documents.Actor }).actor =
      configured.value;

    await updateProfileAccentColor(current, "#ae2c12");

    expect(configured.value.system.appearance.accentColor).toBe("#4176BA");
    expect(current.system).toMatchObject({ accentColor: "#AE2C12" });
    expect(
      vi.mocked(configured.value.update).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(current.update).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("creates the Profile and its marked Ability, then remains idempotent", async () => {
    const configured = actor([]);
    const source = profile("source", "Executor", [IMPETUS_UUID]);

    const createdProfile = await setAgentProfile(configured.value, source);
    await setAgentProfile(configured.value, createdProfile);

    expect(configured.items.filter((item) => item.type === "ability")).toHaveLength(1);
    expect(configured.items.find((item) => item.type === "ability")?.flags).toEqual({
      ordemparanormal2: {
        sourceUuid: IMPETUS_UUID,
        profileGrant: {
          profileItemId: createdProfile.id,
          abilityUuid: IMPETUS_UUID,
        },
      },
    });
  });

  it("replaces grants in place, creates first, and removes only obsolete managed Abilities", async () => {
    const current = profile("profile-id", "Executor", [IMPETUS_UUID]);
    const managed = ownedAbility("managed", IMPETUS_UUID, "profile-id");
    const manual = ownedAbility("manual", "Item.unrelated");
    const configured = actor([current, managed, manual]);
    (current as unknown as { actor: foundry.documents.Actor }).actor = configured.value;

    await setAgentProfile(
      configured.value,
      profile("source", "Analista", [EVALUATION_UUID]),
    );

    expect(configured.items).toContain(manual);
    expect(configured.items).not.toContain(managed);
    expect(configured.items.find((item) => item.type === "profile")?.id).toBe(
      "profile-id",
    );
    expect(configured.items.some((item) => item.type === "ability" && item.id?.startsWith("created-"))).toBe(true);
    expect(vi.mocked(configured.value.createEmbeddedDocuments).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(configured.value.updateEmbeddedDocuments).mock.invocationCallOrder[0],
    );
    expect(vi.mocked(configured.value.updateEmbeddedDocuments).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(configured.value.deleteEmbeddedDocuments).mock.invocationCallOrder[0],
    );
  });

  it("retains shared managed grants and their owned resource state", async () => {
    const current = profile("profile-id", "Executor", [IMPETUS_UUID]);
    const shared = ownedAbility("shared", IMPETUS_UUID, "profile-id");
    const configured = actor([current, shared]);
    (current as unknown as { actor: foundry.documents.Actor }).actor = configured.value;

    await setAgentProfile(
      configured.value,
      profile("source", "Híbrido", [IMPETUS_UUID, EVALUATION_UUID]),
    );

    expect(configured.items).toContain(shared);
    expect(shared.system).toEqual({
      resource: { value: 2, max: 3 },
    });
    expect(configured.items.filter((item) => item.type === "ability")).toHaveLength(2);
  });

  it("lets a manual same-source Ability satisfy a grant and survive removal", async () => {
    const manual = ownedAbility("manual", IMPETUS_UUID);
    const configured = actor([manual]);

    const createdProfile = await setAgentProfile(
      configured.value,
      profile("source", "Executor", [IMPETUS_UUID]),
    );
    expect(configured.items.filter((item) => item.type === "ability")).toEqual([manual]);

    await clearAgentProfile(configured.value);
    expect(configured.items).toEqual([manual]);
    expect(configured.value.deleteEmbeddedDocuments).toHaveBeenLastCalledWith(
      "Item",
      [createdProfile.id],
    );
  });

  it("updates embedded declarations and reconciles immediately", async () => {
    const current = profile("profile-id");
    const configured = actor([current]);
    (current as unknown as { actor: foundry.documents.Actor }).actor = configured.value;

    await updateAgentProfileAbilityGrants(configured.value, current, [
      { uuid: IMPETUS_UUID },
      { uuid: IMPETUS_UUID },
    ]);

    expect(current.system).toEqual({ abilityGrants: [{ uuid: IMPETUS_UUID }] });
    expect(configured.items.filter((item) => item.type === "ability")).toHaveLength(1);
  });

  it("preflights invalid grants without mutating the Profile", async () => {
    const current = profile("profile-id", "Executor", [IMPETUS_UUID]);
    const configured = actor([current]);
    (current as unknown as { actor: foundry.documents.Actor }).actor = configured.value;

    await expect(
      setAgentProfile(
        configured.value,
        profile("source", "Analista", ["Compendium.missing.Item.nope"]),
      ),
    ).rejects.toThrow("missing");
    expect(configured.value.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(current.name).toBe("Executor");
  });

  it("leaves managed partial state repairable after a database failure", async () => {
    const current = profile("profile-id", "Analista", [EVALUATION_UUID]);
    const desired = ownedAbility("desired", EVALUATION_UUID, "profile-id");
    const obsolete = ownedAbility("obsolete", IMPETUS_UUID, "profile-id");
    const configured = actor([current, desired, obsolete]);
    (current as unknown as { actor: foundry.documents.Actor }).actor = configured.value;
    vi.mocked(configured.value.deleteEmbeddedDocuments).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(setAgentProfile(configured.value, current)).rejects.toThrow(
      "database unavailable",
    );
    expect(configured.items).toContain(obsolete);

    await setAgentProfile(configured.value, current);
    expect(configured.items).not.toContain(obsolete);
    expect(configured.items).toContain(desired);
  });

  it("removes the Profile and its managed grants in one batch and rejects duplicate Profiles", async () => {
    const current = profile("profile-id");
    const managed = ownedAbility("managed", IMPETUS_UUID, "profile-id");
    const unrelated = ownedAbility("other", EVALUATION_UUID, "other-profile");
    const configured = actor([current, managed, unrelated]);

    await clearAgentProfile(configured.value);
    expect(configured.value.deleteEmbeddedDocuments).toHaveBeenCalledWith(
      "Item",
      ["profile-id", "managed"],
    );
    expect(configured.items).toEqual([unrelated]);

    expect(() =>
      getAgentProfile(actor([profile("a"), profile("b")]).value),
    ).toThrow(AgentProfileConflictError);
  });
});
