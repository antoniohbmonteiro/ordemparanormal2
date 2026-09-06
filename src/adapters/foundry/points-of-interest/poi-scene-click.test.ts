import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenPoiSceneClick } from "./poi-scene-click";
import type { PoiActionTarget } from "./poi-canvas-session";

const target: PoiActionTarget = { regionId: "r1", itemUuid: "Item.poi", name: "Sala 3" };
const other: PoiActionTarget = { regionId: "r2", itemUuid: "Item.two", name: "Sala 4" };

function pointer(type: string, x: number, y: number, button = 0): Event {
  return Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y, button });
}

function harness(overrides: Partial<Parameters<typeof listenPoiSceneClick>[0]> = {}) {
  const view = new EventTarget();
  const env = {
    view,
    isModeOn: vi.fn(() => true),
    targetAt: vi.fn(() => target as PoiActionTarget | null),
    isBlockedAt: vi.fn(() => false),
    open: vi.fn(),
    ...overrides,
  };
  const stop = listenPoiSceneClick(env);
  return { view, env, stop };
}

beforeEach(() => { vi.stubGlobal("window", new EventTarget()); });
afterEach(() => vi.unstubAllGlobals());

describe("POI scene left-click", () => {
  it("opens the Application on a click that lands and releases in the same POI", () => {
    const { view, env } = harness();
    view.dispatchEvent(pointer("pointerdown", 100, 100));
    view.dispatchEvent(pointer("pointerup", 102, 101));
    expect(env.open).toHaveBeenCalledExactlyOnceWith(target);
  });

  it("never blocks native events", () => {
    const { view } = harness();
    const down = pointer("pointerdown", 10, 10);
    const up = pointer("pointerup", 10, 10);
    view.dispatchEvent(down);
    view.dispatchEvent(up);
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
  });

  it("does not open while Investigation Mode is OFF", () => {
    const { view, env } = harness({ isModeOn: vi.fn(() => false) });
    view.dispatchEvent(pointer("pointerdown", 0, 0));
    view.dispatchEvent(pointer("pointerup", 0, 0));
    expect(env.open).not.toHaveBeenCalled();
  });

  it("treats a drag past the slop as not a click", () => {
    const { view, env } = harness();
    view.dispatchEvent(pointer("pointerdown", 0, 0));
    view.dispatchEvent(pointer("pointerup", 40, 40));
    expect(env.open).not.toHaveBeenCalled();
  });

  it("ignores clicks that miss every POI", () => {
    const { view, env } = harness({ targetAt: vi.fn(() => null) });
    view.dispatchEvent(pointer("pointerdown", 5, 5));
    view.dispatchEvent(pointer("pointerup", 5, 5));
    expect(env.open).not.toHaveBeenCalled();
  });

  it("gives a Token priority: a Token under the whole click does not open the POI", () => {
    const { view, env } = harness({ isBlockedAt: vi.fn(() => true) });
    view.dispatchEvent(pointer("pointerdown", 5, 5));
    view.dispatchEvent(pointer("pointerup", 5, 5));
    expect(env.open).not.toHaveBeenCalled();
  });

  it("does not open when the gesture starts on a Token but releases in free POI space", () => {
    const isBlockedAt = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const { view, env } = harness({ isBlockedAt });
    view.dispatchEvent(pointer("pointerdown", 5, 5));
    view.dispatchEvent(pointer("pointerup", 6, 6));
    expect(env.open).not.toHaveBeenCalled();
  });

  it("does not open when the gesture starts in free POI space but releases on a Token", () => {
    const isBlockedAt = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const { view, env } = harness({ isBlockedAt });
    view.dispatchEvent(pointer("pointerdown", 5, 5));
    view.dispatchEvent(pointer("pointerup", 6, 6));
    expect(env.open).not.toHaveBeenCalled();
  });

  it("opens for a click in free POI space with no Token under it", () => {
    const { view, env } = harness();
    view.dispatchEvent(pointer("pointerdown", 5, 5));
    view.dispatchEvent(pointer("pointerup", 5, 5));
    expect(env.open).toHaveBeenCalledExactlyOnceWith(target);
  });

  it("does not open when down and up land in different POIs", () => {
    const targetAt = vi.fn().mockReturnValueOnce(target).mockReturnValueOnce(other);
    const { view, env } = harness({ targetAt });
    view.dispatchEvent(pointer("pointerdown", 5, 5));
    view.dispatchEvent(pointer("pointerup", 6, 6));
    expect(env.open).not.toHaveBeenCalled();
  });

  it("ignores non-left buttons", () => {
    const { view, env } = harness();
    view.dispatchEvent(pointer("pointerdown", 5, 5, 2));
    view.dispatchEvent(pointer("pointerup", 5, 5, 2));
    expect(env.open).not.toHaveBeenCalled();
  });

  it("drops a pending gesture on pointercancel or window blur", () => {
    const cancel = harness();
    cancel.view.dispatchEvent(pointer("pointerdown", 5, 5));
    cancel.view.dispatchEvent(new Event("pointercancel"));
    cancel.view.dispatchEvent(pointer("pointerup", 5, 5));
    expect(cancel.env.open).not.toHaveBeenCalled();

    const blur = harness();
    blur.view.dispatchEvent(pointer("pointerdown", 5, 5));
    (globalThis.window as EventTarget).dispatchEvent(new Event("blur"));
    blur.view.dispatchEvent(pointer("pointerup", 5, 5));
    expect(blur.env.open).not.toHaveBeenCalled();
  });

  it("stops listening after disposal", () => {
    const { view, env, stop } = harness();
    stop();
    view.dispatchEvent(pointer("pointerdown", 5, 5));
    view.dispatchEvent(pointer("pointerup", 5, 5));
    expect(env.open).not.toHaveBeenCalled();
  });
});
