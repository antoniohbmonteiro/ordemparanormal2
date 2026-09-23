import { expect, it, vi } from "vitest";
import { readPoiCanvasRegion, type PoiGeometry } from "./poi-canvas-regions";
import { findPoiHover, orderPoiHover } from "./poi-canvas-hover";

function geometry(area = 100): PoiGeometry {
  return { area, bounds: { contains: vi.fn(() => true) }, testPoint: vi.fn(() => true),
    drawShape: vi.fn(), *[Symbol.iterator]() {} };
}

it("uses the authorized Scene projection to decide whether a Region can appear", () => {
  const region = { id: "r", parent: { id: "scene" }, viewed: true, polygonTree: geometry(),
    getFlag: () => ({ itemUuid: "Item.poi", name: "untrusted snapshot" }) };
  const viewer = { isGM: false, userId: "player" };
  expect(readPoiCanvasRegion(region, "scene", viewer, new Map())).toBeNull();
  expect(readPoiCanvasRegion(region, "scene", viewer, new Map([["Item.poi", "Approved name"]])))
    .toMatchObject({ itemUuid: "Item.poi", name: "Approved name" });
  expect(readPoiCanvasRegion({ ...region, getFlag: () => ({ itemUuid: "Compendium.world.poi.Item.a" }) },
    "scene", viewer, new Map([["Compendium.world.poi.Item.a", "Old"]]))).toBeNull();
});

it("keeps native PolygonTree hit testing and overlap priority", () => {
  const small = geometry(10); const large = geometry(100);
  const ordered = orderPoiHover([{ id: "large", itemUuid: "Item.a", geometry: large }, { id: "small", itemUuid: "Item.b", geometry: small }]);
  expect(ordered.map(entry => entry.id)).toEqual(["small", "large"]);
  expect(findPoiHover(ordered, { x: 1, y: 2 })).toBe("small");
  vi.mocked(small.testPoint).mockReturnValue(false);
  expect(findPoiHover(ordered, { x: 1, y: 2 })).toBe("large");
});
