import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPoiRegionAssociationUpdate, parsePoiRegionAssociation, POI_REGION_FLAG_PATH, readPoiRegionAssociation } from "./poi-region-association";

afterEach(() => vi.unstubAllGlobals());

describe("POI Region association", () => {
  it.each([undefined, null, [], "Item.a", 3, true, {}, { itemUuid: "" }, { itemUuid: "  " }, { itemUuid: 1 }])(
    "rejects unusable association %j", value => expect(parsePoiRegionAssociation(value)).toBeNull(),
  );

  it("rejects old Compendium associations", () => {
    const getFlag = vi.fn(() => ({ itemUuid: "Compendium.world.poi.Item.abc", secret: "ignored" }));
    expect(readPoiRegionAssociation({ getFlag })).toBeNull();
    expect(getFlag).toHaveBeenCalledExactlyOnceWith("ordemparanormal2", "pointOfInterest");
  });

  it("ignores legacy name snapshots", () => {
    expect(parsePoiRegionAssociation({ itemUuid: "Item.a", name: "Armário Azul" }))
      .toEqual({ itemUuid: "Item.a" });
    expect(parsePoiRegionAssociation({ itemUuid: "Item.a", name: "  " })).toEqual({ itemUuid: "Item.a" });
    expect(parsePoiRegionAssociation({ itemUuid: "Item.a", name: 5 })).toEqual({ itemUuid: "Item.a" });
  });

  it("writes only the uuid", () => {
    const create = vi.fn((value: unknown) => ({ replacement: value }));
    vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create } } } });
    buildPoiRegionAssociationUpdate({ kind: "associate", association: { itemUuid: "Item.a" } });
    expect(create).toHaveBeenCalledExactlyOnceWith({ itemUuid: "Item.a" });
  });

  it("leaves the entire update untouched for an unchanged draft", () => {
    expect(buildPoiRegionAssociationUpdate({ kind: "unchanged" })).toEqual({});
  });

  it("uses public replacement/deletion operators exclusively at the association key", () => {
    class ForcedDeletion {}
    const create = vi.fn((value: unknown) => ({ replacement: value }));
    vi.stubGlobal("foundry", { data: { operators: { ForcedDeletion, ForcedReplacement: { create } } } });
    const replacement = buildPoiRegionAssociationUpdate({ kind: "associate", association: { itemUuid: "Item.abc" } });
    expect(replacement).toEqual({ [POI_REGION_FLAG_PATH]: { replacement: { itemUuid: "Item.abc" } } });
    expect(create).toHaveBeenCalledExactlyOnceWith({ itemUuid: "Item.abc" });
    expect(buildPoiRegionAssociationUpdate({ kind: "remove" })).toEqual({ [POI_REGION_FLAG_PATH]: expect.any(ForcedDeletion) });
    expect(POI_REGION_FLAG_PATH).toBe("flags.ordemparanormal2.pointOfInterest");
  });
});
