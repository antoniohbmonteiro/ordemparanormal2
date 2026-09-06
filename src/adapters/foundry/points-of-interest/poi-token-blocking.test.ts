import { afterEach, describe, expect, it, vi } from "vitest";
import { isTokenInteractionAt } from "./poi-token-blocking";

function token(visible: boolean, hit: boolean) {
  return { visible, bounds: { contains: vi.fn(() => hit) } };
}

function stubCanvas(tokens: ReturnType<typeof token>[] | undefined, coords = { x: 50, y: 60 }) {
  vi.stubGlobal("canvas", tokens === undefined ? { canvasCoordinatesFromClient: vi.fn(() => coords) } : {
    canvasCoordinatesFromClient: vi.fn(() => coords),
    tokens: { placeables: tokens },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("isTokenInteractionAt", () => {
  it("is false with no canvas, no token layer, or no tokens", () => {
    vi.stubGlobal("canvas", undefined);
    expect(isTokenInteractionAt({ x: 1, y: 1 })).toBe(false);
    stubCanvas(undefined);
    expect(isTokenInteractionAt({ x: 1, y: 1 })).toBe(false);
    stubCanvas([]);
    expect(isTokenInteractionAt({ x: 1, y: 1 })).toBe(false);
  });

  it("is true when a visible Token's bounds contain the converted point", () => {
    stubCanvas([token(true, true)]);
    expect(isTokenInteractionAt({ x: 10, y: 20 })).toBe(true);
  });

  it("ignores invisible Tokens and Tokens whose bounds miss the point", () => {
    stubCanvas([token(false, true), token(true, false)]);
    expect(isTokenInteractionAt({ x: 10, y: 20 })).toBe(false);
  });

  it("converts client coordinates to canvas coordinates before the bounds test", () => {
    const hitToken = token(true, true);
    stubCanvas([hitToken], { x: 123, y: 456 });
    isTokenInteractionAt({ x: 5, y: 5 });
    expect(hitToken.bounds.contains).toHaveBeenCalledWith(123, 456);
  });
});
