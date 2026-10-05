import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { investigationMode } from "./investigation-mode";
import { countPoiVisibleLocations, hasPoiVisibleLocation, locatePoiInCurrentScene } from "./poi-scene-locator";

const { requestScene } = vi.hoisted(() => ({ requestScene: vi.fn() }));
vi.mock("./poi-runtime-queries", () => ({ requestPoiScene: requestScene }));

afterEach(() => { investigationMode.set(false); vi.unstubAllGlobals(); });
beforeEach(() => { requestScene.mockReset(); });

function region(itemUuid = "Item.poi") {
  return { id: "region", parent: { id: "scene" }, viewed: true,
    polygonTree: { area: 100, bounds: { x: 10, y: 20, width: 100, height: 60, contains: () => true } },
    getFlag: () => ({ itemUuid }) };
}

it("pans to a linked Region on the viewed Scene and enables its existing highlight", async () => {
  const animatePan = vi.fn(async () => undefined);
  vi.stubGlobal("game", { user: { id: "gm", isGM: true } });
  vi.stubGlobal("canvas", { ready: true, scene: { id: "scene", regions: [region()] }, animatePan });
  expect(await locatePoiInCurrentScene("scene", "Item.other")).toBe(false);
  expect(animatePan).not.toHaveBeenCalled();
  expect(await locatePoiInCurrentScene("scene", "Item.poi")).toBe(true);
  expect(animatePan).toHaveBeenCalledWith({ x: 60, y: 50, duration: 250 });
  expect(investigationMode.get()).toBe(true);
  expect(await locatePoiInCurrentScene("other", "Item.poi")).toBe(false);
  expect(requestScene).not.toHaveBeenCalled();
});

it("uses canvas eligibility and the authorized projection for player location", async () => {
  const animatePan = vi.fn(async () => undefined);
  const eligible = region();
  vi.stubGlobal("game", { user: { id: "player", isGM: false } });
  vi.stubGlobal("canvas", { ready: true, scene: { id: "scene", regions: [eligible] }, animatePan });
  const allowed = new Map([["Item.poi", "Armário"]]);
  expect(hasPoiVisibleLocation("scene", "Item.poi", new Map())).toBe(false);
  expect(hasPoiVisibleLocation("scene", "Item.poi", allowed)).toBe(true);
  expect(countPoiVisibleLocations("scene", "Item.poi", allowed)).toBe(1);
  requestScene.mockResolvedValue({ entries: [{ itemUuid: "Item.poi", name: "Armário", linkedRegionIds: [] }] });
  expect(await locatePoiInCurrentScene("scene", "Item.poi")).toBe(true);
  expect(animatePan).toHaveBeenCalledWith({ x: 60, y: 50, duration: 250 });
});

it("does not disclose or pan to an ineligible player placement", async () => {
  const animatePan = vi.fn(async () => undefined);
  const hidden = { ...region(), viewed: false };
  vi.stubGlobal("game", { user: { id: "player", isGM: false } });
  vi.stubGlobal("canvas", { ready: true, scene: { id: "scene", regions: [hidden] }, animatePan });
  const allowed = new Map([["Item.poi", "Armário"]]);
  expect(hasPoiVisibleLocation("scene", "Item.poi", allowed)).toBe(false);
  expect(countPoiVisibleLocations("scene", "Item.poi", allowed)).toBe(0);
  requestScene.mockResolvedValue({ entries: [{ itemUuid: "Item.poi", name: "Armário" }] });
  expect(await locatePoiInCurrentScene("scene", "Item.poi")).toBe(false);
  hidden.viewed = true;
  requestScene.mockResolvedValue({ entries: [] });
  expect(await locatePoiInCurrentScene("scene", "Item.poi")).toBe(false);
  expect(animatePan).not.toHaveBeenCalled();
  expect(investigationMode.get()).toBe(false);
});

it("ignores a hidden Region even when another Region for the same POI is eligible", async () => {
  const animatePan = vi.fn(async () => undefined);
  const hidden = { ...region(), id: "hidden", viewed: false };
  const visible = { ...region(), id: "visible", polygonTree: { area: 100,
    bounds: { x: 200, y: 100, width: 40, height: 20, contains: () => true } } };
  vi.stubGlobal("game", { user: { id: "player", isGM: false } });
  vi.stubGlobal("canvas", { ready: true, scene: { id: "scene", regions: [hidden, visible] }, animatePan });
  const allowed = new Map([["Item.poi", "Armário"]]);
  expect(countPoiVisibleLocations("scene", "Item.poi", allowed)).toBe(1);
  requestScene.mockResolvedValue({ entries: [{ itemUuid: "Item.poi", name: "Armário" }] });
  expect(await locatePoiInCurrentScene("scene", "Item.poi")).toBe(true);
  expect(animatePan).toHaveBeenCalledWith({ x: 220, y: 110, duration: 250 });
});
