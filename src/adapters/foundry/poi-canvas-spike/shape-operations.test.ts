import type Canvas from "@client/canvas/board.mjs";
import type RegionDocument from "@client/documents/region.mjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editPoiSpikeShapes, findPoiSpikeShapeTarget } from "./shape-operations";
import { editPoiSpikeRegion, placePoiSpikeRegion } from "./scene-controls";

const circle = (x: number, hole = false) => ({ type: "circle", x, y: 50, radius: 20, hole });
function setup(shapes = [circle(50)]) {
  let source = structuredClone(shapes);
  const region = {
    id: "region1", uuid: "Scene.scene1.Region.region1", levels: new Set(["level1"]),
    getFlag: vi.fn(() => ({ itemUuid: "Item.poi1" })),
    toObject: () => ({ shapes: structuredClone(source) }),
    update: vi.fn(async (data: { shapes: ReturnType<typeof circle>[] }) => { source = data.shapes; }),
  };
  const documents = new Map([[region.id, region]]);
  const scene = { regions: { get: (id: string) => documents.get(id), [Symbol.iterator]: () => documents.values() } };
  const previewShape = circle(400);
  const board = {
    ready: true, scene,
    regions: {
      controlled: [] as { document: typeof region }[],
      placeRegion: vi.fn().mockResolvedValue({ toObject: () => ({ shapes: [previewShape] }) }),
    },
  };
  vi.stubGlobal("canvas", board);
  return { board, documents, region, previewShape, typed: board as unknown as Canvas,
    target: region as unknown as RegionDocument };
}

beforeEach(() => {
  vi.stubGlobal("game", { user: { isGM: true } });
  vi.stubGlobal("ui", { notifications: { info: vi.fn(), warn: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("POI multi-shape operations", () => {
  it.each([false, true])("appends positioned shape (hole=%s) to the same document without persisting the preview", async (hole) => {
    const { typed, target, board, region, documents, previewShape } = setup();
    const original = region.toObject();
    await editPoiSpikeShapes(typed, target, hole ? "addHole" : "addPositive");
    expect(board.regions.placeRegion).toHaveBeenCalledWith(expect.objectContaining({
      shapes: [expect.objectContaining({ hole: false })],
    }), { create: false });
    expect(region.update).toHaveBeenCalledExactlyOnceWith({ shapes: [...original.shapes, { ...previewShape, hole }] });
    expect(region.uuid).toBe("Scene.scene1.Region.region1");
    expect(documents.size).toBe(1);
    expect(region.getFlag()).toEqual({ itemUuid: "Item.poi1" });
    expect(original.shapes).toEqual([circle(50)]);
    expect(previewShape.hole).toBe(false);
  });

  it("repositions the last hole without adding a shape or losing its negative role", async () => {
    const { typed, target, region, previewShape } = setup([circle(50), circle(60, true)]);
    await editPoiSpikeShapes(typed, target, "repositionLast");
    expect(region.toObject().shapes).toEqual([circle(50), { ...previewShape, hole: true }]);
  });

  it("reorders then removes array entries on the same Region, preserving order and hole data", async () => {
    const { typed, target, board, region } = setup([circle(50), circle(400), circle(60, true)]);
    await editPoiSpikeShapes(typed, target, "lastFirst");
    expect(region.toObject().shapes).toEqual([circle(60, true), circle(50), circle(400)]);
    await editPoiSpikeShapes(typed, target, "removeLast");
    expect(region.toObject().shapes).toEqual([circle(60, true), circle(50)]);
    expect(board.regions.placeRegion).not.toHaveBeenCalled();
    expect(region.update).toHaveBeenCalledTimes(2);
  });

  it("preserves the final shape and does nothing on cancellation", async () => {
    const { typed, target, board, region } = setup();
    await editPoiSpikeShapes(typed, target, "removeLast");
    await editPoiSpikeShapes(typed, target, "lastFirst");
    board.regions.placeRegion.mockResolvedValue(null);
    await editPoiSpikeShapes(typed, target, "addHole");
    expect(region.update).not.toHaveBeenCalled();
  });

  it.each(["scene", "deleted", "edited", "unmarked", "permission"])("rejects a stale preview after %s changes", async (change) => {
    const { typed, target, board, region, documents } = setup();
    board.regions.placeRegion.mockImplementation(async () => {
      if (change === "scene") board.scene = { ...board.scene };
      if (change === "deleted") documents.clear();
      if (change === "edited") await region.update({ shapes: [circle(999)] });
      if (change === "unmarked") region.getFlag.mockReturnValue({ itemUuid: "" });
      if (change === "permission") vi.stubGlobal("game", { user: { isGM: false } });
      region.update.mockClear();
      return { toObject: () => ({ shapes: [circle(400)] }) };
    });
    await editPoiSpikeShapes(typed, target, "addPositive");
    expect(region.update).not.toHaveBeenCalled();
  });

  it("requires a GM and a persisted marked target", async () => {
    const { typed, target, board, region } = setup();
    vi.stubGlobal("game", { user: { isGM: false } });
    await editPoiSpikeShapes(typed, target, "addHole");
    vi.stubGlobal("game", { user: { isGM: true } });
    region.getFlag.mockReturnValue({ itemUuid: "" });
    await editPoiSpikeShapes(typed, target, "addHole");
    expect(board.regions.placeRegion).not.toHaveBeenCalled();
    expect(region.update).not.toHaveBeenCalled();
  });

  it("targets one selected POI or the only POI in the Scene, rejecting ambiguity", () => {
    const { typed, board, region, documents } = setup();
    expect(findPoiSpikeShapeTarget(typed)).toBe(region);
    const second = { ...region, id: "region2" };
    documents.set(second.id, second);
    expect(findPoiSpikeShapeTarget(typed)).toBeNull();
    board.regions.controlled = [{ document: second }];
    expect(findPoiSpikeShapeTarget(typed)).toBe(second);
    board.regions.controlled.push({ document: region });
    expect(findPoiSpikeShapeTarget(typed)).toBeNull();
  });

  it("shares the placement guard across Region creation and shape editing, including failures", async () => {
    const { board, region } = setup();
    let resolve!: (value: null) => void;
    board.regions.placeRegion.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = editPoiSpikeRegion("addHole");
    await editPoiSpikeRegion("addPositive");
    await placePoiSpikeRegion();
    expect(board.regions.placeRegion).toHaveBeenCalledTimes(1);
    resolve(null);
    await pending;
    board.regions.placeRegion.mockRejectedValueOnce(new Error("preview failed"));
    await expect(editPoiSpikeRegion("addHole")).rejects.toThrow("preview failed");
    await editPoiSpikeRegion("addPositive");
    expect(region.update).toHaveBeenCalledOnce();
  });
});
