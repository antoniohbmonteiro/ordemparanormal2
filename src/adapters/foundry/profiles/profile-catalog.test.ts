import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadAvailableProfiles,
  resolveProfileCatalogSource,
} from "./profile-catalog";

afterEach(() => {
  vi.unstubAllGlobals();
});

function collection<T extends { readonly id?: string; readonly collection?: string }>(
  values: readonly T[],
) {
  const byId = new Map(
    values.map((value) => [value.id ?? value.collection ?? "", value]),
  );

  return {
    get: (id: string) => byId.get(id),
    *[Symbol.iterator]() {
      yield* values;
    },
  };
}

describe("Profile catalog", () => {
  it("lists visible world and visible Item-compendium Profiles", async () => {
    const worldProfile = {
      id: "world-profile",
      name: "Analista",
      img: "world.webp",
      type: "profile",
      visible: true,
      uuid: "Item.world-profile",
    };
    const hiddenWorldProfile = {
      id: "hidden",
      name: "Oculto",
      type: "profile",
      visible: false,
      uuid: "Item.hidden",
    };
    const visiblePack = {
      collection: "world.profiles",
      documentName: "Item",
      title: "Perfis da mesa",
      visible: true,
      getIndex: vi.fn().mockResolvedValue([
        {
          _id: "pack-profile",
          uuid: "Compendium.world.profiles.Item.pack-profile",
          name: "Executor",
          type: "profile",
        },
        {
          _id: "other",
          uuid: "Compendium.world.profiles.Item.other",
          name: "Outro",
          type: "ability",
        },
      ]),
      getDocument: vi.fn(),
    };
    const hiddenPack = {
      ...visiblePack,
      collection: "world.hidden",
      visible: false,
      getIndex: vi.fn(),
    };
    const items = collection([worldProfile, hiddenWorldProfile]);
    const packs = collection([visiblePack, hiddenPack]);

    vi.stubGlobal("game", {
      i18n: { localize: () => "Mundo" },
      items,
      packs,
    });

    const entries = await loadAvailableProfiles();

    expect(entries.map(({ name, origin }) => [name, origin])).toEqual([
      ["Analista", "Mundo"],
      ["Executor", "Perfis da mesa"],
    ]);
    expect(entries.map(({ uuid }) => uuid)).toEqual([
      "Item.world-profile",
      "Compendium.world.profiles.Item.pack-profile",
    ]);
    expect(hiddenPack.getIndex).not.toHaveBeenCalled();
  });

  it("loads a full compendium document only when resolving a selection", async () => {
    const selected = { type: "profile" };
    const pack = {
      collection: "system.profiles",
      documentName: "Item",
      title: "Perfis",
      visible: true,
      getIndex: vi.fn(),
      getDocument: vi.fn().mockResolvedValue(selected),
    };

    vi.stubGlobal("game", {
      i18n: { localize: () => "Mundo" },
      items: collection([]),
      packs: collection([pack]),
    });

    await expect(
      resolveProfileCatalogSource({
        kind: "compendium",
        packId: pack.collection,
        documentId: "selected",
      }),
    ).resolves.toBe(selected);
    expect(pack.getDocument).toHaveBeenCalledWith("selected");
  });
});
