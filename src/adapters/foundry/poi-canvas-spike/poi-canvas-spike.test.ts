import { Container } from "@pixi/display";
import { Polygon } from "@pixi/math";
import type Canvas from "@client/canvas/board.mjs";
import type { SceneControl } from "@client/applications/ui/scene-controls.mjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../../config/system-config";
import { registerPoiCanvasSpike } from "../../../bootstrap/register-poi-canvas-spike";
import { createPoiSpikeRegionData, POI_SPIKE_FLAG, readPoiSpikePlacement } from "./placement";
import { PoiSpikeRenderer, type PoiSpikeRegion } from "./renderer";
import { addPoiSpikeSceneControls, placePoiSpikeRegion } from "./scene-controls";

// Real PIXI containers/transforms and polygons; drawing commands need no GPU here.
class Graphics extends Container {
  clear = vi.fn(() => this);
  lineStyle = vi.fn(() => this);
  drawPolygon = vi.fn((_polygon: Polygon) => this);
}

function region(id = "region1", sceneId = "scene1") {
  const polygon = new Polygon(createPoiSpikeRegionData("Item.poi1").shapes[0].points);
  const hole = new Polygon([20, 20, 40, 20, 40, 40, 20, 40]);
  return {
    id,
    parent: { id: sceneId },
    levels: new Set<string>(),
    getFlag: vi.fn(() => ({ itemUuid: "Item.poi1" })),
    polygons: [polygon, hole],
    polygonTree: { testPoint: vi.fn(({ x, y }: { x: number; y: number }) =>
      polygon.contains(x, y) && !hole.contains(x, y)) },
  };
}

function asRegion(value: ReturnType<typeof region>): PoiSpikeRegion {
  return value as unknown as PoiSpikeRegion;
}

function setupBoard(regions = [region()]) {
  const stage = new Container();
  const group = stage.addChild(new Container());
  const view = new EventTarget();
  const board = {
    ready: true,
    scene: { id: "scene1", regions },
    level: { id: "level1" },
    interface: group,
    app: { view },
    regions: { placeRegion: vi.fn().mockResolvedValue(null) },
    canvasCoordinatesFromClient: vi.fn((point: { x: number; y: number }) => stage.toLocal(point)),
  };
  return { board, typed: board as unknown as Canvas, view, stage, group };
}

function move(view: EventTarget, x: number, y: number) {
  const event = new Event("pointermove");
  Object.assign(event, { clientX: x, clientY: y });
  view.dispatchEvent(event);
}

beforeEach(() => {
  vi.stubGlobal("PIXI", { Container, Graphics });
  vi.stubGlobal("game", { user: { isGM: true }, items: [{ type: "pointOfInterest", uuid: "Item.poi1" }] });
  vi.stubGlobal("ui", { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
  vi.stubGlobal("CONST", { REGION_VISIBILITY: { LAYER: 0 }, DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("POI spike placement boundary", () => {
  it("accepts canonical standalone UUIDs and rejects malformed or embedded references", () => {
    expect(readPoiSpikePlacement({ itemUuid: "Compendium.ordemparanormal2.pois.Item.abc123" })).not.toBeNull();
    for (const value of [null, {}, { itemUuid: 1 }, { itemUuid: "Actor.a.Item.b" },
      { itemUuid: "Compendium.scope.pack.id" }, { itemUuid: " Item.poi1" }]) {
      expect(readPoiSpikePlacement(value)).toBeNull();
    }
    expect(() => createPoiSpikeRegionData("bad")).toThrow();
  });

  it("registers a separate GM group without altering existing controls", () => {
    const controls: Record<string, SceneControl> = {
      tokens: { name: "tokens", title: "Tokens", order: 0, icon: "token", tools: {}, activeTool: "select" },
    };
    const tokens = controls.tokens;
    addPoiSpikeSceneControls(controls);
    expect(controls.tokens).toBe(tokens);
    expect(controls.poiCanvasSpike.tools.place.button).toBe(true);
    vi.stubGlobal("game", { user: { isGM: false } });
    const playerControls = {};
    addPoiSpikeSceneControls(playerControls);
    expect(playerControls).toEqual({});
  });

  it("uses public native placement with canonical metadata and no config sheet", async () => {
    const { board } = setupBoard();
    vi.stubGlobal("canvas", board);
    await placePoiSpikeRegion();
    const [data, options] = board.regions.placeRegion.mock.calls[0];
    expect(data.flags[SYSTEM_ID][POI_SPIKE_FLAG]).toEqual({ itemUuid: "Item.poi1" });
    expect(data.shapes[0].points).toHaveLength(12);
    expect(options).toEqual({ create: true, createOptions: { renderSheet: false } });
    expect(data).not.toHaveProperty("system");
  });

  it("does not create a placement without a POI, canvas, or GM permission", async () => {
    const { board } = setupBoard();
    vi.stubGlobal("canvas", board);
    vi.stubGlobal("game", { user: { isGM: true }, items: [] });
    await placePoiSpikeRegion();
    vi.stubGlobal("game", { user: { isGM: false } });
    await placePoiSpikeRegion();
    board.ready = false;
    vi.stubGlobal("game", { user: { isGM: true } });
    await placePoiSpikeRegion();
    expect(board.regions.placeRegion).not.toHaveBeenCalled();
  });

  it("prevents concurrent placement and releases the guard on cancellation or failure", async () => {
    const { board } = setupBoard();
    vi.stubGlobal("canvas", board);
    let resolve!: (value: null) => void;
    board.regions.placeRegion.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = placePoiSpikeRegion();
    await placePoiSpikeRegion();
    expect(board.regions.placeRegion).toHaveBeenCalledTimes(1);
    resolve(null);
    await pending;
    board.regions.placeRegion.mockRejectedValueOnce(new Error("placement failed"));
    await expect(placePoiSpikeRegion()).rejects.toThrow("placement failed");
    await placePoiSpikeRegion();
    expect(board.regions.placeRegion).toHaveBeenCalledTimes(3);
  });
});

describe("POI spike renderer boundary", () => {
  it("re-reads the resolved geometry of one multi-shape Region through update hooks", () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    vi.stubGlobal("Hooks", {
      on: (name: string, callback: (...args: unknown[]) => void) => {
        callbacks.set(name, callback);
        return callbacks.size;
      }, off: vi.fn(),
    });
    const document = region();
    const { typed, group, view } = setupBoard([document]);
    const dispose = registerPoiCanvasSpike();
    callbacks.get("canvasReady")!(typed);
    move(view, 30, 30);
    const container = group.children[0] as Container;
    const original = container.children[0];
    const second = new Polygon([400, 0, 500, 0, 500, 100, 400, 100]);
    const [positive, hole] = document.polygons;
    // Boundary fixtures represent successive Foundry results, not a replacement
    // boolean-shape engine. Actual Region composition has a separate runtime probe.
    const applyResolved = (polygons: Polygon[], inside: boolean) => {
      document.polygons = polygons;
      document.polygonTree.testPoint.mockReturnValue(inside);
      callbacks.get("updateRegion")!(asRegion(document));
      expect(container.children).toHaveLength(1);
      const graphics = container.children[0] as Graphics;
      expect(graphics.drawPolygon.mock.calls.slice(-polygons.length).map(([p]) => p)).toEqual(polygons);
      expect(graphics.lineStyle).toHaveBeenLastCalledWith(inside ? 6 : 3, inside ? 0xffcc00 : 0x00ccff, 1);
    };
    applyResolved([positive, hole, second], false);
    expect(original.destroyed).toBe(true);
    // Moving the hole before the positive shape fills the previous hole.
    applyResolved([positive, second], true);
    // Restoring its order recuts; moving/removing it fills the old location.
    applyResolved([positive, hole, second], false);
    applyResolved([positive, second], true);
    applyResolved([positive], true);
    dispose();
    expect(group.children).toHaveLength(0);
  });

  it("draws resolved polygons and uses exact containment including concavity and holes", () => {
    const { typed, view } = setupBoard();
    const renderer = new PoiSpikeRenderer(typed);
    const document = region();
    renderer.upsert(asRegion(document));
    const graphics = renderer.container.children[0] as Graphics;
    expect(graphics.drawPolygon.mock.calls.map(([polygon]) => polygon)).toEqual(document.polygons);
    expect(renderer.container.eventMode).toBe("none");
    move(view, 60, 60);
    expect(graphics.lineStyle).toHaveBeenLastCalledWith(6, 0xffcc00, 1);
    move(view, 200, 200);
    expect(graphics.lineStyle).toHaveBeenLastCalledWith(3, 0x00ccff, 1);
    move(view, 30, 30);
    expect(document.polygonTree.testPoint).toHaveLastReturnedWith(false);
    move(view, 60, 60);
    view.dispatchEvent(new Event("pointerleave"));
    expect(graphics.lineStyle).toHaveBeenLastCalledWith(3, 0x00ccff, 1);
    renderer.destroy();
  });

  it("inherits the canvas transform and recalculates hover after pan/zoom with a stationary pointer", () => {
    const { typed, view, stage } = setupBoard();
    const renderer = new PoiSpikeRenderer(typed);
    renderer.upsert(asRegion(region()));
    const graphics = renderer.container.children[0] as Graphics;
    move(view, 120, 120);
    stage.position.set(20, 20);
    stage.scale.set(2);
    renderer.onPan();
    const callback = vi.mocked(requestAnimationFrame).mock.calls[0][0];
    callback(0);
    expect(graphics.lineStyle).toHaveBeenLastCalledWith(6, 0xffcc00, 1);
    expect(renderer.container.toGlobal({ x: 50, y: 50 })).toMatchObject({ x: 120, y: 120 });
    renderer.destroy();
  });

  it("replaces edited geometry, removes deleted/unmarked placements and ignores other scenes", () => {
    const { typed } = setupBoard();
    const renderer = new PoiSpikeRenderer(typed);
    const document = region();
    renderer.upsert(asRegion(document));
    const old = renderer.container.children[0];
    document.polygons = [new Polygon([500, 500, 600, 500, 500, 600])];
    renderer.upsert(asRegion(document));
    expect(old.destroyed).toBe(true);
    expect(renderer.container.children).toHaveLength(1);
    expect((renderer.container.children[0] as Graphics).drawPolygon).toHaveBeenCalledWith(document.polygons[0]);
    renderer.upsert(asRegion(region("other", "otherScene")));
    renderer.remove(asRegion(region("region1", "otherScene")));
    expect(renderer.container.children).toHaveLength(1);
    document.getFlag.mockReturnValue({ itemUuid: "broken" });
    renderer.upsert(asRegion(document));
    expect(renderer.container.children).toHaveLength(0);
    const valid = asRegion(region());
    renderer.upsert(valid);
    renderer.remove(valid);
    expect(renderer.container.children).toHaveLength(0);
    renderer.destroy();
  });

  it("filters placements bound to another level", () => {
    const { typed } = setupBoard();
    const renderer = new PoiSpikeRenderer(typed);
    const document = region();
    document.levels.add("otherLevel");
    renderer.upsert(asRegion(document));
    expect(renderer.container.children).toHaveLength(0);
    renderer.destroy();
  });

  it("cleans owned graphics, listeners and pending work idempotently", () => {
    const { typed, view, board, group } = setupBoard();
    const remove = vi.spyOn(view, "removeEventListener");
    const renderer = new PoiSpikeRenderer(typed);
    renderer.upsert(asRegion(region()));
    const graphics = renderer.container.children[0];
    renderer.onPan();
    renderer.destroy();
    renderer.destroy();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(graphics.destroyed).toBe(true);
    expect(group.children).toHaveLength(0);
    move(view, 50, 50);
    expect(board.canvasCoordinatesFromClient).not.toHaveBeenCalled();
  });
});

describe("POI spike lifecycle wiring", () => {
  it("rebuilds from persisted scene regions, handles document hooks and unregisters on disposal", () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    const off = vi.fn();
    vi.stubGlobal("Hooks", {
      on: (name: string, callback: (...args: unknown[]) => void) => {
        callbacks.set(name, callback);
        return callbacks.size;
      }, off,
    });
    const dispose = registerPoiCanvasSpike();
    const first = setupBoard();
    callbacks.get("canvasReady")!(first.typed);
    const old = first.group.children[0];
    expect((old as Container).children).toHaveLength(1);
    callbacks.get("createRegion")!(asRegion(region("second")));
    expect((old as Container).children).toHaveLength(2);
    callbacks.get("deleteRegion")!(asRegion(region("second")));
    expect((old as Container).children).toHaveLength(1);
    callbacks.get("canvasTearDown")!();
    expect(old.destroyed).toBe(true);
    callbacks.get("updateRegion")!(asRegion(region()));
    const second = setupBoard();
    callbacks.get("canvasReady")!(second.typed);
    expect(second.group.children).toHaveLength(1);
    callbacks.get("canvasReady")!(second.typed);
    expect(second.group.children).toHaveLength(1);
    vi.stubGlobal("game", { user: { isGM: false } });
    callbacks.get("canvasReady")!(second.typed);
    expect(second.group.children).toHaveLength(0);
    dispose();
    expect(off).toHaveBeenCalledTimes(callbacks.size);
  });
});
