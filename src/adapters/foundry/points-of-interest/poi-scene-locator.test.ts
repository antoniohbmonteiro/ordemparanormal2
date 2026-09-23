import { afterEach, expect, it, vi } from "vitest";
import { investigationMode } from "./investigation-mode";
import { locatePoiInCurrentScene } from "./poi-scene-locator";

afterEach(() => { investigationMode.set(false); vi.unstubAllGlobals(); });

it("pans to a linked Region on the viewed Scene and enables its existing highlight", async () => {
  const animatePan = vi.fn(async () => undefined);
  const region = { viewed: true, polygonTree: { bounds: { x: 10, y: 20, width: 100, height: 60 } },
    getFlag: () => ({ itemUuid: "Item.poi" }) };
  vi.stubGlobal("canvas", { ready: true, scene: { id: "scene", regions: [region] }, animatePan });
  expect(await locatePoiInCurrentScene("scene", "Item.other")).toBe(false);
  expect(animatePan).not.toHaveBeenCalled();
  expect(await locatePoiInCurrentScene("scene", "Item.poi")).toBe(true);
  expect(animatePan).toHaveBeenCalledWith({ x: 60, y: 50, duration: 250 });
  expect(investigationMode.get()).toBe(true);
  expect(await locatePoiInCurrentScene("other", "Item.poi")).toBe(false);
});
