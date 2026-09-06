import { describe, expect, it, vi } from "vitest";
import { listenPoiSceneContextMenu } from "./poi-scene-context-menu";
import type { PoiActionTarget } from "./poi-canvas-session";

const target: PoiActionTarget = { regionId: "r1", itemUuid: "Item.poi", name: "Sala 3" };

function rightClick(x = 40, y = 60): Event {
  return Object.assign(new Event("contextmenu", { cancelable: true, bubbles: true }), {
    clientX: x,
    clientY: y,
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  });
}

function harness(overrides: Partial<Parameters<typeof listenPoiSceneContextMenu>[0]> = {}) {
  const view = new EventTarget();
  const env = {
    view,
    isActionable: vi.fn(() => true),
    targetAt: vi.fn(() => target as PoiActionTarget | null),
    open: vi.fn(),
    ...overrides,
  };
  const stop = listenPoiSceneContextMenu(env);
  return { view, env, stop };
}

describe("POI scene context menu interception", () => {
  it("opens the actions UI for a GM using selectPoi over a POI and suppresses the native menu", () => {
    const { view, env } = harness();
    const event = rightClick();
    view.dispatchEvent(event);

    expect(env.targetAt).toHaveBeenCalledWith({ x: 40, y: 60 });
    expect(env.open).toHaveBeenCalledWith(target, { x: 40, y: 60 });
    expect(event.defaultPrevented).toBe(true);
    const spied = event as unknown as { stopPropagation: ReturnType<typeof vi.fn>; stopImmediatePropagation: ReturnType<typeof vi.fn> };
    expect(spied.stopPropagation).toHaveBeenCalled();
    expect(spied.stopImmediatePropagation).toHaveBeenCalled();
  });

  it("ignores a right-click that misses every POI and leaves the native menu alone", () => {
    const { view, env } = harness({ targetAt: vi.fn(() => null) });
    const event = rightClick();
    view.dispatchEvent(event);

    expect(env.open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not intercept when the tool/group is not selectPoi (e.g. Tokens active)", () => {
    const { view, env } = harness({ isActionable: vi.fn(() => false) });
    const event = rightClick();
    view.dispatchEvent(event);

    expect(env.targetAt).not.toHaveBeenCalled();
    expect(env.open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops listening after disposal", () => {
    const { view, env, stop } = harness();
    stop();
    view.dispatchEvent(rightClick());
    expect(env.open).not.toHaveBeenCalled();
  });
});
