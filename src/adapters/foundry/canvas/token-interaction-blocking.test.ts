import { afterEach, describe, expect, it, vi } from "vitest";

import { isTokenInteractionAt } from "./token-interaction-blocking";

function token(visible: boolean, hit: boolean) {
  return { visible, bounds: { contains: vi.fn(() => hit) } };
}

function stubCanvas(tokens: ReturnType<typeof token>[] | undefined, coords = { x: 50, y: 60 }) {
  vi.stubGlobal("canvas", tokens === undefined ? {
    canvasCoordinatesFromClient: vi.fn(() => coords),
  } : {
    canvasCoordinatesFromClient: vi.fn(() => coords),
    tokens: { placeables: tokens },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("isTokenInteractionAt", () => {
  it("is false with no canvas, token layer, or tokens", () => {
    vi.stubGlobal("canvas", undefined);
    expect(isTokenInteractionAt({ x: 1, y: 1 })).toBe(false);
    stubCanvas(undefined);
    expect(isTokenInteractionAt({ x: 1, y: 1 })).toBe(false);
    stubCanvas([]);
    expect(isTokenInteractionAt({ x: 1, y: 1 })).toBe(false);
  });

  it("blocks only a visible Token whose bounds contain the converted point", () => {
    const hit = token(true, true);
    stubCanvas([token(false, true), token(true, false), hit], { x: 123, y: 456 });
    expect(isTokenInteractionAt({ x: 5, y: 6 })).toBe(true);
    expect(hit.bounds.contains).toHaveBeenCalledWith(123, 456);
  });
});
