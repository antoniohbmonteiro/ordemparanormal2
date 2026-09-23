import { afterEach, expect, it, vi } from "vitest";
import { loadAvailablePois, resolvePoiCatalogSource } from "./poi-catalog";

afterEach(() => vi.unstubAllGlobals());

it("offers only GM-controlled World POIs and rejects compendium selection", async () => {
  class Item {
    id = "poi"; uuid = "Item.poi"; type = "pointOfInterest"; name = "Armário"; img = "";
    isEmbedded = false; pack = null; visible = true; ownership = { default: 0 };
    testUserPermission() { return false; }
  }
  const item = new Item();
  vi.stubGlobal("foundry", { documents: { Item } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1 } });
  vi.stubGlobal("game", { items: { contents: [item], get: () => item },
    users: { contents: [{ id: "player", isGM: false }] }, i18n: { localize: () => "Mundo" } });
  expect(await loadAvailablePois()).toMatchObject([{ uuid: "Item.poi", source: { kind: "world", documentId: "poi" } }]);
  await expect(resolvePoiCatalogSource({ kind: "compendium", packId: "world.poi", documentId: "x" })).rejects.toThrow();
});
