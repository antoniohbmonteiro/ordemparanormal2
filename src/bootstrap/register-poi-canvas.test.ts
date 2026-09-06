import { afterEach, describe, expect, it, vi } from "vitest";
import { createPoiCanvasSession } from "../adapters/foundry/points-of-interest/poi-canvas-session";
import { registerPoiCanvas } from "./register-poi-canvas";

vi.mock("../adapters/foundry/points-of-interest/poi-canvas-session", () => ({ createPoiCanvasSession: vi.fn() }));
vi.mock("../applications/points-of-interest/investigation-application", () => ({ openInvestigationApplication: vi.fn() }));
vi.mock("../adapters/foundry/points-of-interest/poi-actions-menu", () => ({ openPoiActionsMenu: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function register() {
  const hooks = new Map<string, (...args: unknown[]) => void>();
  vi.stubGlobal("Hooks", { on: (key: string, action: (...args: unknown[]) => void) => hooks.set(key, action) });
  const user = { isGM: true, id: "u1" };
  vi.stubGlobal("game", { user, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("ui", { controls: new EventTarget() });
  vi.stubGlobal("window", new EventTarget());
  const session = { destroy: vi.fn(), pan: vi.fn(), reconcile: vi.fn(),
    regionChanged: vi.fn(), regionDeleted: vi.fn(), invalidateItems: vi.fn(), poiActionTargetAt: vi.fn() };
  vi.mocked(createPoiCanvasSession).mockReturnValue(session);
  return { hooks, user, session };
}

describe("POI canvas lifecycle registration", () => {
  it("restarts on ready even in the same Scene, forwards public events and rebuilds on role flip", () => {
    const { hooks, user, session } = register();
    vi.stubGlobal("canvas", { ready: true });
    registerPoiCanvas();
    expect(hooks.size).toBe(13);
    hooks.get("canvasReady")!(); expect(createPoiCanvasSession).toHaveBeenCalledOnce();
    hooks.get("canvasPan")!({}, { level: "second" }); expect(session.pan).toHaveBeenCalledWith({ level: "second" });
    hooks.get("canvasTearDown")!(); hooks.get("canvasInit")!(); hooks.get("canvasReady")!();
    expect(session.destroy).toHaveBeenCalledOnce(); expect(createPoiCanvasSession).toHaveBeenCalledTimes(2);
    hooks.get("updateRegion")!({ id: "r" }); expect(session.regionChanged).toHaveBeenCalledWith({ id: "r" });
    hooks.get("deleteRegion")!({ id: "r" }); expect(session.regionDeleted).toHaveBeenCalledWith({ id: "r" });
    hooks.get("updateItem")!({ uuid: "Item.a" });
    const itemMatches = session.invalidateItems.mock.calls[0][0];
    expect(itemMatches("Item.a")).toBe(true); expect(itemMatches("Item.b")).toBe(false);
    hooks.get("updateCompendium")!({ collection: "world.poi" });
    const packMatches = session.invalidateItems.mock.calls[1][0];
    expect(packMatches("Compendium.world.poi.Item.a")).toBe(true);
    expect(packMatches("Compendium.world.poi2.Item.a")).toBe(false);
    // GM demotion rebuilds the session (now a player session); a role-stable update is a no-op.
    user.isGM = false; hooks.get("updateUser")!(user);
    expect(session.destroy).toHaveBeenCalledTimes(2);
    expect(createPoiCanvasSession).toHaveBeenCalledTimes(3);
    hooks.get("updateUser")!(user);
    expect(createPoiCanvasSession).toHaveBeenCalledTimes(3);
  });

  it("wires the left-click listener for a non-GM but not the GM-only context menu", () => {
    const { hooks, user } = register();
    user.isGM = false;
    const events: string[] = [];
    const view = {
      addEventListener: vi.fn((type: string) => events.push(type)),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("canvas", { ready: true, app: { view }, scene: { id: "scene1" } });
    registerPoiCanvas();
    hooks.get("canvasReady")!();
    expect(createPoiCanvasSession).toHaveBeenCalledOnce();
    expect(vi.mocked(createPoiCanvasSession).mock.calls[0][0]).toMatchObject({ userId: "u1" });
    expect(events).toContain("pointerdown");
    expect(events).toContain("pointerup");
    expect(events).not.toContain("contextmenu");

    // stop() aborts the click listener
    hooks.get("canvasTearDown")!();
    // the click controller's AbortController fires 'abort'; no explicit removeEventListener assertions needed
  });

  it("wires the context menu as well for a GM", () => {
    const { hooks } = register();
    const events: string[] = [];
    const view = { addEventListener: vi.fn((type: string) => events.push(type)), removeEventListener: vi.fn() };
    vi.stubGlobal("canvas", { ready: true, app: { view }, scene: { id: "scene1" } });
    registerPoiCanvas();
    hooks.get("canvasReady")!();
    expect(events).toContain("pointerdown");
    expect(events).toContain("contextmenu");
  });
});
