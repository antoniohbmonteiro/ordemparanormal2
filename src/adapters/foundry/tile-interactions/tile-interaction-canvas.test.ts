import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTileInteractionCanvasSession,
  tileInteractionPointerSurface,
  type TileInteractionCanvas,
  type TileInteractionCanvasEnvironment,
} from "./tile-interaction-canvas";
import type { TileInteractionTileDocument } from "../../../features/tile-interactions/toggle-tile-interaction";

function pointer(type: string, x: number, y: number, options: Partial<PointerEvent> = {}): Event {
  return Object.assign(new Event(type, { cancelable: true }), {
    clientX: x,
    clientY: y,
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...options,
  });
}

function tile(id: string, options: {
  enabled?: boolean;
  visible?: boolean;
  hit?: boolean;
  z?: number;
  wallIds?: string[];
  hidden?: boolean;
  hasPreview?: boolean;
} = {}) {
  const document = {
    id,
    hidden: options.hidden ?? !(options.visible ?? true),
    parent: null,
    z: options.z ?? 0,
    getFlag: vi.fn(() => ({
      enabled: options.enabled ?? true,
      wallIds: options.wallIds ?? ["wall"],
      tileIds: [],
    })),
  } as unknown as TileInteractionTileDocument & { z: number };
  return {
    document,
    isVisible: options.visible ?? true,
    hasPreview: options.hasPreview ?? false,
    mesh: { containsCanvasPoint: vi.fn(() => options.hit ?? true) },
  };
}

function harness(options: {
  active?: boolean;
  isGM?: boolean;
  blocked?: boolean;
  tiles?: ReturnType<typeof tile>[];
  pendingToggle?: boolean;
  pixi7?: boolean;
} = {}) {
  const surface = new EventTarget();
  const tiles = options.tiles ?? [tile("controller")];
  const canvas = {
    app: options.pixi7 ? { view: surface } : { canvas: surface },
    tiles: { active: options.active ?? false, placeables: tiles },
    canvasCoordinatesFromClient: vi.fn((point: { x: number; y: number }) => point),
  } as TileInteractionCanvas;
  let resolveToggle: ((value: { status: "updated"; state: "open"; ignoredIds: never[] }) => void) | undefined;
  const toggle = options.pendingToggle
    ? vi.fn(() => new Promise(resolve => { resolveToggle = resolve; }))
    : vi.fn().mockResolvedValue({ status: "updated", state: "open", ignoredIds: [] });
  let now = 1000;
  const env: TileInteractionCanvasEnvironment = {
    canvas,
    isGM: () => options.isGM ?? true,
    isBlockedAt: vi.fn(() => options.blocked ?? false),
    toggle,
    notify: vi.fn(),
    now: () => now,
    doubleClickTime: 250,
  };
  const session = createTileInteractionCanvasSession(env);
  const click = (downOptions: Partial<PointerEvent> = {}, upOptions = downOptions) => {
    surface.dispatchEvent(pointer("pointerdown", 10, 10, downOptions));
    surface.dispatchEvent(pointer("pointerup", 12, 11, upOptions));
  };
  return {
    surface, tiles, env, toggle, session, click,
    advance: (ms: number) => { now += ms; },
    resolveToggle: () => resolveToggle?.({ status: "updated", state: "open", ignoredIds: [] }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Tile interaction canvas session", () => {
  it("prefers Application.canvas over view and falls back to view for PixiJS 7", () => {
    const modern = new EventTarget();
    const legacy = new EventTarget();
    expect(tileInteractionPointerSurface({ canvas: modern, view: legacy })).toBe(modern);
    expect(tileInteractionPointerSurface({ view: legacy })).toBe(legacy);
    expect(tileInteractionPointerSurface({})).toBeNull();
  });

  it("receives pointer events on Foundry v14's PixiJS 7 view", async () => {
    const value = harness({ pixi7: true });
    value.click();
    await vi.waitFor(() => expect(value.toggle).toHaveBeenCalledOnce());
  });

  it("toggles the highest visible enabled overlapping Tile without blocking native events", async () => {
    const low = tile("low", { z: 1 });
    const high = tile("high", { z: 5 });
    const value = harness({ tiles: [low, high] });
    const down = pointer("pointerdown", 10, 10);
    const up = pointer("pointerup", 11, 11);
    value.surface.dispatchEvent(down);
    value.surface.dispatchEvent(up);
    await vi.waitFor(() => expect(value.toggle).toHaveBeenCalledOnce());
    expect(value.toggle).toHaveBeenCalledWith(high.document);
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
  });

  it("uses deterministic layer order for equal stacks", async () => {
    const first = tile("first", { z: 2 });
    const last = tile("last", { z: 2 });
    const value = harness({ tiles: [first, last] });
    value.click();
    await vi.waitFor(() => expect(value.toggle).toHaveBeenCalledWith(last.document));
  });

  it.each([
    ["non-GM", { isGM: false }],
    ["active TilesLayer", { active: true }],
    ["overlapping Token", { blocked: true }],
  ])("does nothing for %s", async (_label, options) => {
    const value = harness(options);
    value.click();
    await Promise.resolve();
    expect(value.toggle).not.toHaveBeenCalled();
  });

  it("ignores hidden and disabled Tiles", async () => {
    const value = harness({ tiles: [
      tile("hidden", { visible: false }),
      tile("disabled", { enabled: false }),
    ] });
    value.click();
    await Promise.resolve();
    expect(value.toggle).not.toHaveBeenCalled();
  });

  it("ignores a hidden document even if Foundry exposes it as visible to a GM", async () => {
    const hidden = tile("hidden", { visible: true });
    (hidden.document as { hidden: boolean }).hidden = true;
    const value = harness({ tiles: [hidden] });
    value.click();
    await Promise.resolve();
    expect(value.toggle).not.toHaveBeenCalled();
  });

  it("recognizes a saved controller while TileConfig's native preview makes it invisible", async () => {
    const previewed = tile("previewed", {
      visible: false, hidden: false, hasPreview: true,
    });
    const value = harness({ pixi7: true, tiles: [previewed] });
    value.click();
    await vi.waitFor(() => expect(value.toggle).toHaveBeenCalledExactlyOnceWith(previewed.document));
  });

  it("does not treat every invisible Tile or a hidden preview as clickable", async () => {
    const invisible = tile("invisible", { visible: false, hidden: false });
    const hiddenPreview = tile("hidden-preview", {
      visible: false, hidden: true, hasPreview: true,
    });
    const value = harness({ tiles: [invisible, hiddenPreview] });
    value.click();
    await Promise.resolve();
    expect(value.toggle).not.toHaveBeenCalled();
  });

  it("passes a click on an enabled control without targets to the use-case", async () => {
    const empty = tile("empty", { wallIds: [] });
    const value = harness({ tiles: [empty] });
    value.click();
    await vi.waitFor(() => expect(value.toggle).toHaveBeenCalledExactlyOnceWith(empty.document));
  });

  it("skips a visible Tile without a mesh instead of interrupting other clicks", async () => {
    const broken = { ...tile("broken", { z: 5 }), mesh: null };
    const valid = tile("valid", { z: 1 });
    const value = harness({
      tiles: [broken as unknown as ReturnType<typeof tile>, valid],
    });
    value.click();
    await vi.waitFor(() => expect(value.toggle).toHaveBeenCalledExactlyOnceWith(valid.document));
  });

  it("rejects drag, right button, modifiers, and different down/up Tiles", async () => {
    const drag = harness();
    drag.surface.dispatchEvent(pointer("pointerdown", 0, 0));
    drag.surface.dispatchEvent(pointer("pointerup", 30, 30));

    const right = harness();
    right.click({ button: 2 });
    const modified = harness();
    modified.click({ shiftKey: true });

    const first = tile("first");
    const second = tile("second", { hit: false, z: 2 });
    second.mesh.containsCanvasPoint
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    first.mesh.containsCanvasPoint
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const different = harness({ tiles: [first, second] });
    different.click();
    await Promise.resolve();
    expect(drag.toggle).not.toHaveBeenCalled();
    expect(right.toggle).not.toHaveBeenCalled();
    expect(modified.toggle).not.toHaveBeenCalled();
    expect(different.toggle).not.toHaveBeenCalled();
  });

  it("cancels on pointer cancellation and blur, and stops after destroy", async () => {
    for (const eventName of ["pointercancel", "pointerleave", "lostpointercapture"] as const) {
      const value = harness();
      value.surface.dispatchEvent(pointer("pointerdown", 10, 10));
      value.surface.dispatchEvent(new Event(eventName));
      value.surface.dispatchEvent(pointer("pointerup", 10, 10));
      expect(value.toggle).not.toHaveBeenCalled();
    }
    const blur = harness();
    blur.surface.dispatchEvent(pointer("pointerdown", 10, 10));
    blur.surface.dispatchEvent(new Event("blur"));
    blur.surface.dispatchEvent(pointer("pointerup", 10, 10));
    expect(blur.toggle).not.toHaveBeenCalled();
    blur.session.destroy();
    blur.click();
    await Promise.resolve();
    expect(blur.toggle).not.toHaveBeenCalled();
  });

  it("blocks while pending and applies a per-Tile double-click cooldown", async () => {
    const pending = harness({ pendingToggle: true });
    pending.click();
    pending.advance(300);
    pending.click();
    expect(pending.toggle).toHaveBeenCalledOnce();
    pending.resolveToggle();
    await Promise.resolve();
    await Promise.resolve();

    const cooldown = harness();
    cooldown.click();
    await Promise.resolve();
    cooldown.advance(100);
    cooldown.click();
    await Promise.resolve();
    expect(cooldown.toggle).toHaveBeenCalledOnce();
    cooldown.advance(200);
    cooldown.click();
    await vi.waitFor(() => expect(cooldown.toggle).toHaveBeenCalledTimes(2));
  });
});
