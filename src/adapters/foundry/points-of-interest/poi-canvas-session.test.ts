import { describe, expect, it, vi } from "vitest";
import { createPoiCanvasSession, type PoiSessionEnvironment } from "./poi-canvas-session";
import { readPoiCanvasRegion, type PoiGeometry } from "./poi-canvas-regions";
import { findPoiHover, orderPoiHover } from "./poi-canvas-hover";
import { POI_CONTROL_NAME } from "./poi-control-state";

function geometry(area = 100): PoiGeometry {
  return { area, bounds: { contains: vi.fn(() => true) }, testPoint: vi.fn(() => true),
    drawShape: vi.fn(), *[Symbol.iterator]() {} };
}

function fixture(enabled = true) {
  let gm = true;
  const subscribers = new Set<(value: boolean) => void>();
  const mode = { get: () => enabled, subscribe: (listener: (value: boolean) => void) => {
    subscribers.add(listener); return () => { subscribers.delete(listener); };
  }, set(value: boolean) { enabled = value; for (const listener of subscribers) listener(value); } };
  const regions = ["a", "b"].map((id, index) => ({ id, parent: { id: "scene" }, viewed: index === 0,
    polygonTree: geometry(), getFlag: vi.fn((): unknown => ({ itemUuid: `Item.${id}` })) }));
  const controls = Object.assign(new EventTarget(), {
    control: { name: POI_CONTROL_NAME }, tool: { name: "selectPoi" },
  });
  const view = new EventTarget();
  const focus = new EventTarget();
  const scene = { id: "scene", regions };
  const canvas = { scene, ready: true, level: { id: "first" }, app: { view },
    canvasCoordinatesFromClient: vi.fn(point => point) };
  const visuals = { setVisible: vi.fn(), upsert: vi.fn(), remove: vi.fn(), hover: vi.fn(), label: vi.fn(), camera: vi.fn(), destroy: vi.fn() };
  const resolve = vi.fn(async (uuid: string) => ({ name: `Name ${uuid}`, gmContext: "NEVER RENDER" }));
  const render = vi.fn(() => visuals);
  const env = { canvas, mode, focus, isGM: () => gm, localize: (key: string) => key } as unknown as PoiSessionEnvironment;
  const start = () => createPoiCanvasSession(env, { render, resolve });
  const move = () => view.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 30, clientY: 40 }));
  return { mode, subscribers, regions, controls, view, focus, canvas, visuals, resolve, render, start, move, setGM: (value: boolean) => { gm = value; } };
}

describe("POI discovery and native hit testing", () => {
  it("requires a persisted, viewed, associated Region of the current Scene", () => {
    const region = fixture().regions[0];
    expect(readPoiCanvasRegion(region, "scene")?.id).toBe("a");
    for (const invalid of [{ id: null }, { viewed: false }, { parent: { id: "other" } },
      { getFlag: () => null }, { getFlag: () => ({ itemUuid: " " }) }, { polygonTree: geometry(0) }]) {
      expect(readPoiCanvasRegion({ ...region, ...invalid }, "scene")).toBeNull();
    }
  });
  it("uses bounds only to reject and delegates holes to the native tree", () => {
    const shape = geometry();
    const candidates = [{ id: "a", itemUuid: "Item.a", geometry: shape }];
    vi.mocked(shape.testPoint).mockReturnValue(false);
    expect(findPoiHover(candidates, { x: 3, y: 4 })).toBeNull();
    expect(shape.testPoint).toHaveBeenCalledWith({ x: 3, y: 4 });
    vi.mocked(shape.bounds.contains).mockReturnValue(false);
    vi.mocked(shape.testPoint).mockClear();
    expect(findPoiHover(candidates, { x: 3, y: 4 })).toBeNull();
    expect(shape.testPoint).not.toHaveBeenCalled();
  });
  it("orders one target by area then stable ID, allowing another Region inside a hole", () => {
    const views = ["c", "b", "a"].map(id => ({ id, itemUuid: id, geometry: geometry(id === "c" ? 50 : 10) }));
    const ordered = orderPoiHover(views);
    expect(ordered.map(v => v.id)).toEqual(["a", "b", "c"]);
    vi.mocked(ordered[0].geometry.testPoint).mockReturnValue(false);
    expect(findPoiHover(ordered, { x: 0, y: 0 })).toBe("b");
  });
});

describe("independent POI canvas session", () => {
  it("does not create visuals or resolve Items for players", () => {
    const f = fixture(); f.setGM(false);
    expect(f.start()).toBeNull(); expect(f.render).not.toHaveBeenCalled(); expect(f.resolve).not.toHaveBeenCalled();
  });
  it("renders idle before lookup and handles hover without a RegionLayer", async () => {
    const f = fixture(); const session = f.start()!;
    expect(f.visuals.upsert).toHaveBeenCalledExactlyOnceWith("a", f.regions[0].polygonTree);
    expect(f.resolve).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(f.resolve).toHaveBeenCalledOnce());
    f.move();
    expect(f.visuals.hover).toHaveBeenLastCalledWith("a");
    expect(f.visuals.label).toHaveBeenLastCalledWith("Name Item.a", { x: 30, y: 40 });
    f.controls.control.name = "tokens"; f.controls.tool.name = "select";
    f.controls.dispatchEvent(new Event("activate")); f.move();
    expect(f.visuals.hover).toHaveBeenLastCalledWith("a");
    f.mode.set(false);
    expect(f.visuals.hover).toHaveBeenLastCalledWith(null);
    expect(f.visuals.label).toHaveBeenLastCalledWith(null, { x: 30, y: 40 });
    expect(f.visuals.remove).not.toHaveBeenCalled();
    session.destroy();
  });
  it("starts hidden, retains updates while OFF and resumes without rebuilding", () => {
    const f = fixture(false); const session = f.start()!;
    expect(f.visuals.setVisible).toHaveBeenCalledWith(false);
    f.move(); expect(f.regions[0].polygonTree.testPoint).not.toHaveBeenCalled();
    expect(f.visuals.hover).toHaveBeenLastCalledWith(null);
    f.regions[0].polygonTree = geometry(35); session.regionChanged(f.regions[0]);
    f.visuals.upsert.mockClear();
    f.mode.set(true);
    expect(f.visuals.setVisible).toHaveBeenLastCalledWith(true);
    expect(f.visuals.hover).toHaveBeenLastCalledWith("a");
    expect(f.visuals.upsert).not.toHaveBeenCalled();
    session.destroy(); expect(f.subscribers.size).toBe(0);
    f.visuals.setVisible.mockClear(); f.mode.set(false);
    expect(f.visuals.setVisible).not.toHaveBeenCalled();
  });
  it.each([true, false])("reconciles Level changes incrementally (payload level: %s)", explicit => {
    const f = fixture(); const session = f.start()!;
    f.move(); f.visuals.upsert.mockClear();
    session.pan({}); session.pan({});
    expect(f.regions[0].getFlag).toHaveBeenCalledOnce();
    expect(f.visuals.upsert).not.toHaveBeenCalled();
    f.regions[0].viewed = false; f.regions[1].viewed = true; f.canvas.level.id = "second";
    session.pan(explicit ? { level: "second" } : {});
    expect(f.visuals.remove).toHaveBeenCalledExactlyOnceWith("a");
    expect(f.visuals.upsert).toHaveBeenCalledExactlyOnceWith("b", f.regions[1].polygonTree);
    expect(f.visuals.hover).toHaveBeenLastCalledWith("b");
    f.regions[0].viewed = true; f.regions[1].viewed = false; f.canvas.level.id = "first";
    session.pan({}); session.pan({});
    expect(f.visuals.upsert.mock.calls.map(([id]) => id)).toEqual(["b", "a"]);
    expect(f.visuals.remove.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    session.destroy();
  });
  it("preserves nodes still viewed and clears hover when the new Level is empty", () => {
    const f = fixture(); const session = f.start()!; f.move();
    session.pan({ level: "second" });
    expect(f.visuals.upsert).toHaveBeenCalledOnce();
    f.regions[0].viewed = false; session.pan({ level: "empty" });
    expect(f.visuals.hover).toHaveBeenLastCalledWith(null);
    expect(f.visuals.label).toHaveBeenLastCalledWith(null, { x: 30, y: 40 });
    session.destroy();
  });
  it("updates only changed geometry, excludes previews and removes on desassociation/delete", () => {
    const f = fixture(); const session = f.start()!;
    session.regionChanged({ ...f.regions[0], polygonTree: geometry(20) });
    expect(f.visuals.upsert).toHaveBeenCalledOnce();
    f.regions[0].polygonTree = geometry(30); session.regionChanged(f.regions[0]);
    expect(f.visuals.upsert).toHaveBeenCalledTimes(2);
    f.regions[0].getFlag.mockReturnValue(null); session.regionChanged(f.regions[0]);
    expect(f.visuals.remove).toHaveBeenCalledExactlyOnceWith("a");
    f.regions[1].viewed = true; session.regionChanged(f.regions[1]); session.regionDeleted(f.regions[1]);
    expect(f.visuals.remove).toHaveBeenLastCalledWith("b");
    session.destroy();
  });
  it("invalidates names without rebuilding geometry and preserves unavailable associations", async () => {
    const f = fixture(); const session = f.start()!;
    await vi.waitFor(() => expect(f.resolve).toHaveBeenCalledOnce());
    f.resolve.mockResolvedValue({ name: "Renamed", gmContext: "SECRET" });
    session.invalidateItems(uuid => uuid === "Item.a");
    await vi.waitFor(() => expect(f.resolve).toHaveBeenCalledTimes(2)); f.move();
    expect(f.visuals.label).toHaveBeenLastCalledWith("Renamed", { x: 30, y: 40 });
    f.resolve.mockRejectedValue(new Error("missing")); session.invalidateItems(() => true);
    await vi.waitFor(() => expect(f.resolve).toHaveBeenCalledTimes(3)); f.move();
    expect(f.visuals.label).toHaveBeenLastCalledWith(expect.stringContaining("Unavailable"), { x: 30, y: 40 });
    expect(f.visuals.upsert).toHaveBeenCalledOnce(); expect(f.visuals.remove).not.toHaveBeenCalled();
    session.destroy();
  });
  it("deduplicates lookups and discards late results after Level changes or teardown", async () => {
    const f = fixture(); let resolve!: (value: { name: string; gmContext: string }) => void;
    f.resolve.mockImplementation(() => new Promise(done => { resolve = done; }));
    f.regions[1].viewed = true; f.regions[1].getFlag.mockReturnValue({ itemUuid: "Item.a" });
    const session = f.start()!; await Promise.resolve(); expect(f.resolve).toHaveBeenCalledOnce();
    f.regions.forEach(region => { region.viewed = false; }); session.pan({ level: "empty" });
    session.destroy(); f.visuals.label.mockClear();
    resolve({ name: "Late", gmContext: "SECRET" }); await Promise.resolve(); await Promise.resolve();
    expect(f.visuals.label).not.toHaveBeenCalled();
    f.move(); f.focus.dispatchEvent(new Event("blur")); f.controls.dispatchEvent(new Event("activate"));
    expect(f.visuals.label).not.toHaveBeenCalled();
    session.destroy(); expect(f.visuals.destroy).toHaveBeenCalledOnce();
  });
  it("clears hover on pointerleave and blur and ignores pan while canvas is unavailable", () => {
    const f = fixture(); const session = f.start()!; f.move();
    f.view.dispatchEvent(new Event("pointerleave")); expect(f.visuals.hover).toHaveBeenLastCalledWith(null);
    f.move(); f.focus.dispatchEvent(new Event("blur")); expect(f.visuals.hover).toHaveBeenLastCalledWith(null);
    f.canvas.ready = false; session.pan({ level: "second" });
    expect(f.visuals.camera).not.toHaveBeenCalled(); session.destroy();
  });
  it("does not start deferred lookups after GM loss", async () => {
    const f = fixture(); const session = f.start()!; f.setGM(false);
    await Promise.resolve(); expect(f.resolve).not.toHaveBeenCalled(); session.destroy();
  });
  it("does not apply a stale name after reassociation", async () => {
    const f = fixture(); let oldResult!: (value: { name: string; gmContext: string }) => void;
    f.resolve.mockImplementationOnce(() => new Promise(done => { oldResult = done; }));
    const session = f.start()!; await Promise.resolve();
    f.regions[0].getFlag.mockReturnValue({ itemUuid: "Item.new" }); session.regionChanged(f.regions[0]);
    await vi.waitFor(() => expect(f.resolve).toHaveBeenCalledTimes(2));
    oldResult({ name: "Stale", gmContext: "SECRET" }); await Promise.resolve(); await Promise.resolve(); f.move();
    expect(f.visuals.label).toHaveBeenLastCalledWith("Name Item.new", { x: 30, y: 40 }); session.destroy();
  });
});
