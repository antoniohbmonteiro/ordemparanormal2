import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preparePoiDrawing, protectPoiDrawingFromConfig, protectPoiDrawingFromControl, POI_CONTROL_NAME } from "./poi-region-drawing";

const sheet = { rendered: false, state: 0 };
const region = { id: "r", parent: { id: "s" }, sheet };
const layer = { active: false, releaseAll: vi.fn(() => 1) };
const controls = { control: { name: POI_CONTROL_NAME }, tool: { name: "createRectangle" }, activate: vi.fn() };
const warn = vi.fn();
beforeEach(() => {
  sheet.rendered = false; sheet.state = 0; layer.active = false; layer.releaseAll.mockClear(); warn.mockClear();
  controls.control.name = POI_CONTROL_NAME; controls.tool.name = "createRectangle";
  controls.activate.mockReset().mockImplementation(async ({ control, tool }: { control: string; tool: string }) => {
    controls.control.name = control; controls.tool.name = tool; if (control === "regions") layer.active = true;
  });
  vi.stubGlobal("game", { user: { isGM: true }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("canvas", { ready: true, scene: { id: "s", regions: [region] }, regions: layer });
  vi.stubGlobal("ui", { controls, notifications: { warn } });
  vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: { RENDER_STATES: { RENDERING: 1 } } } },
    canvas: { layers: { RegionLayer: { prepareSceneControls: () => ({ name: "regions" }) } } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("public POI drawing activation", () => {
  it("awaits native activation before restoring the requested tool, releasing existing Regions", async () => {
    let resume!: () => void;
    controls.activate.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { resume = resolve; });
      controls.control.name = "regions"; controls.tool.name = "select"; layer.active = true;
    });
    const activation = preparePoiDrawing("createRectangle");
    expect(controls.activate).toHaveBeenCalledExactlyOnceWith({ control: "regions", tool: "select" });
    expect(layer.releaseAll).toHaveBeenCalledOnce();
    resume(); await activation;
    expect(controls.activate.mock.calls).toEqual([[{ control: "regions", tool: "select" }], [{ control: POI_CONTROL_NAME, tool: "createRectangle" }]]);
    expect(layer.releaseAll).toHaveBeenCalledTimes(2);
  });
  it("avoids reactivating an already active RegionLayer", async () => {
    layer.active = true; await preparePoiDrawing("createRectangle");
    expect(layer.releaseAll).toHaveBeenCalledOnce(); expect(controls.activate).not.toHaveBeenCalled();
  });
  it.each(["rendered", "rendering"])("blocks a %s sheet without closing or altering it", async state => {
    sheet.rendered = state === "rendered"; sheet.state = state === "rendering" ? 1 : 2;
    await preparePoiDrawing("createRectangle");
    expect(controls.activate).toHaveBeenCalledExactlyOnceWith({ control: POI_CONTROL_NAME, tool: "selectPoi" });
    expect(layer.releaseAll).not.toHaveBeenCalled(); expect(warn).toHaveBeenCalledOnce();
  });
  it("cancels when an existing Region is controlled or its sheet opens during drawing", async () => {
    protectPoiDrawingFromControl({ document: region }, true); await Promise.resolve();
    expect(controls.tool.name).toBe("selectPoi");
    controls.tool.name = "createPolygon"; protectPoiDrawingFromConfig({ document: region }); await Promise.resolve();
    expect(controls.tool.name).toBe("selectPoi"); expect(warn).toHaveBeenCalledTimes(2);
  });
  it("ignores releases, palettes, other Scenes and passive tools", async () => {
    protectPoiDrawingFromControl({ document: region }, false);
    protectPoiDrawingFromConfig({ document: { ...region, id: null } });
    protectPoiDrawingFromConfig({ document: { ...region, parent: { id: "other" } } });
    controls.tool.name = "selectPoi"; protectPoiDrawingFromConfig({ document: region });
    await preparePoiDrawing("createRectangle"); expect(controls.activate).not.toHaveBeenCalled();
  });
});
