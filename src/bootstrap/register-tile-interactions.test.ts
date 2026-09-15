import { afterEach, describe, expect, it, vi } from "vitest";

import { createFoundryTileInteractionCanvasSession } from "../adapters/foundry/tile-interactions/tile-interaction-canvas";
import { registerTileInteractions } from "./register-tile-interactions";

vi.mock("../adapters/foundry/tile-interactions/tile-interaction-canvas", async importOriginal => ({
  ...await importOriginal<typeof import("../adapters/foundry/tile-interactions/tile-interaction-canvas")>(),
  createFoundryTileInteractionCanvasSession: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Tile interaction bootstrap", () => {
  it("starts on canvasReady with Application.canvas and disposes on teardown/init", () => {
    const hooks = new Map<string, () => void>();
    const destroy = vi.fn();
    vi.mocked(createFoundryTileInteractionCanvasSession).mockReturnValue({ destroy });
    vi.stubGlobal("Hooks", { on: (name: string, callback: () => void) => hooks.set(name, callback) });
    const surface = new EventTarget();
    const current = { ready: true, app: { canvas: surface } };
    vi.stubGlobal("canvas", current);
    registerTileInteractions();

    expect([...hooks.keys()]).toEqual(["canvasReady", "canvasTearDown", "canvasInit"]);
    hooks.get("canvasReady")!();
    expect(createFoundryTileInteractionCanvasSession).toHaveBeenCalledExactlyOnceWith(current);
    hooks.get("canvasTearDown")!();
    expect(destroy).toHaveBeenCalledOnce();
    hooks.get("canvasReady")!();
    hooks.get("canvasInit")!();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("starts on Foundry v14's PixiJS 7 Application.view", () => {
    const hooks = new Map<string, () => void>();
    vi.mocked(createFoundryTileInteractionCanvasSession)
      .mockReturnValue({ destroy: vi.fn() });
    vi.stubGlobal("Hooks", { on: (name: string, callback: () => void) => hooks.set(name, callback) });
    const current = { ready: true, app: { view: new EventTarget() } };
    vi.stubGlobal("canvas", current);
    registerTileInteractions();

    hooks.get("canvasReady")!();
    expect(createFoundryTileInteractionCanvasSession).toHaveBeenCalledExactlyOnceWith(current);
  });

  it("does not create a session if neither Application surface exists", () => {
    const hooks = new Map<string, () => void>();
    vi.stubGlobal("Hooks", { on: (name: string, callback: () => void) => hooks.set(name, callback) });
    vi.stubGlobal("canvas", { ready: true, app: {} });
    registerTileInteractions();

    hooks.get("canvasReady")!();
    expect(createFoundryTileInteractionCanvasSession).not.toHaveBeenCalled();
  });
});
