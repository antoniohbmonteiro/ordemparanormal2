import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadAvailableSingleItems,
  resolveSingleItemCatalogSource,
} from "./single-item-catalog";

afterEach(() => vi.unstubAllGlobals());

function collection<T extends { readonly id?: string; readonly collection?: string }>(
  values: readonly T[],
) {
  const byId = new Map(values.map((value) => [value.id ?? value.collection ?? "", value]));
  return {
    get: (id: string) => byId.get(id),
    *[Symbol.iterator]() { yield* values; },
  };
}

const definition = {
  itemType: "occupation",
  worldLabelKey: "World",
  unavailableSourceMessage: "unavailable",
};

describe("single Item catalog", () => {
  it("filters visible world and compendium entries by configured type", async () => {
    const pack = {
      collection: "world.occupations",
      documentName: "Item",
      title: "Ocupações da mesa",
      visible: true,
      getIndex: vi.fn().mockResolvedValue([
        { _id: "occupation", uuid: "Compendium.x.Item.occupation", name: "Piloto", type: "occupation" },
        { _id: "profile", uuid: "Compendium.x.Item.profile", name: "Perfil", type: "profile" },
      ]),
      getDocument: vi.fn(),
    };
    vi.stubGlobal("game", {
      i18n: { localize: () => "Mundo" },
      items: collection([
        { id: "world", uuid: "Item.world", name: "Pesquisador", type: "occupation", visible: true },
        { id: "hidden", uuid: "Item.hidden", name: "Oculta", type: "occupation", visible: false },
      ]),
      packs: collection([pack]),
    });
    const entries = await loadAvailableSingleItems(definition);
    expect(entries.map(({ name }) => name)).toEqual(["Pesquisador", "Piloto"]);
  });

  it("loads the selected document lazily and revalidates its type", async () => {
    const selected = { type: "occupation" };
    const pack = {
      collection: "world.occupations",
      documentName: "Item",
      title: "Ocupações",
      visible: true,
      getIndex: vi.fn(),
      getDocument: vi.fn().mockResolvedValue(selected),
    };
    vi.stubGlobal("game", {
      items: collection([]),
      packs: collection([pack]),
    });
    await expect(resolveSingleItemCatalogSource({
      kind: "compendium",
      packId: pack.collection,
      documentId: "selected",
    }, definition)).resolves.toBe(selected);
    expect(pack.getDocument).toHaveBeenCalledWith("selected");
  });
});
