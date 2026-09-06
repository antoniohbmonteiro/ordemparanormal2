import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAvailablePois, resolvePoiAssociation, resolvePoiCatalogSource } from "./poi-catalog";

class ItemStub {
  id = "world-id";
  uuid = "Item.canonical";
  type = "pointOfInterest";
  name = "POI";
  isEmbedded = false;
  visible = true;
  pack: string | null = null;
}
const item = new ItemStub();
const packed = Object.assign(new ItemStub(), { id: "packed-id", uuid: "Compendium.world.poi.Item.canonical", pack: "world.poi" });
const pack = { collection: "world.poi", documentName: "Item", title: "Compêndio", visible: true,
  getIndex: vi.fn(), getDocument: vi.fn() };
const fromUuidMock = vi.fn();
beforeEach(() => {
  Object.assign(item, new ItemStub());
  pack.visible = true;
  pack.getIndex.mockReset().mockResolvedValue([{ _id: packed.id, uuid: packed.uuid, type: packed.type, name: packed.name }]);
  pack.getDocument.mockReset().mockResolvedValue(packed);
  fromUuidMock.mockReset().mockResolvedValue(item);
  vi.stubGlobal("fromUuid", fromUuidMock);
  vi.stubGlobal("foundry", { documents: { Item: ItemStub } });
  vi.stubGlobal("game", { items: Object.assign([item], { get: () => item }), packs: Object.assign([pack], { get: () => pack }),
    i18n: { localize: () => "Mundo" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("POI catalog", () => {
  it("specializes world and compendium sources without reconstructing UUIDs", async () => {
    const entries = await loadAvailablePois();
    expect(entries.map(entry => entry.uuid)).toEqual([packed.uuid, item.uuid]);
    expect(await resolvePoiCatalogSource({ kind: "world", documentId: item.id })).toEqual({ itemUuid: item.uuid, name: item.name, origin: "Mundo" });
    expect(await resolvePoiCatalogSource({ kind: "compendium", packId: pack.collection, documentId: packed.id }))
      .toEqual({ itemUuid: packed.uuid, name: packed.name, origin: pack.title });
  });
  it.each([{ type: "ability" }, { isEmbedded: true }, { visible: false }])("rejects an invalid selection %j", async changes => {
    Object.assign(item, changes);
    await expect(resolvePoiCatalogSource({ kind: "world", documentId: item.id })).rejects.toThrow("unavailable");
    expect(await resolvePoiAssociation(item.uuid)).toBeNull();
  });
  it("rejects inaccessible packs even when their document is cached", async () => {
    pack.visible = false;
    await expect(resolvePoiCatalogSource({ kind: "compendium", packId: pack.collection, documentId: packed.id })).rejects.toThrow("unavailable");
  });
  it("handles missing, incompatible and failed references without throwing or changing data", async () => {
    for (const value of [null, {}, { type: "pointOfInterest", uuid: item.uuid }]) {
      fromUuidMock.mockResolvedValueOnce(value);
      expect(await resolvePoiAssociation(item.uuid)).toBeNull();
    }
    expect(await resolvePoiAssociation("Item.different")).toBeNull();
    fromUuidMock.mockRejectedValueOnce(new Error("Unavailable"));
    expect(await resolvePoiAssociation(item.uuid)).toBeNull();
    expect(await resolvePoiAssociation(item.uuid)).toEqual({ itemUuid: item.uuid, name: item.name, origin: "Mundo" });
  });
  it("propagates loading failures for the picker retry state", async () => {
    pack.getIndex.mockRejectedValueOnce(new Error("Offline"));
    await expect(loadAvailablePois()).rejects.toThrow("Offline");
  });
});
