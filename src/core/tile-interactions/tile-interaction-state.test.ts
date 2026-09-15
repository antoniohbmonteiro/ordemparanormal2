import { describe, expect, it } from "vitest";

import { decideTileInteractionState } from "./tile-interaction-state";

describe("Tile interaction state", () => {
  it("closes when every controlled Wall is open", () => {
    expect(decideTileInteractionState([true, true])).toBe("closed");
  });

  it.each([
    [[false]],
    [[true, false]],
    [[false, false]],
  ])("opens when at least one Wall is not open: %j", states => {
    expect(decideTileInteractionState(states)).toBe("open");
  });

  it("rejects an empty Wall set", () => {
    expect(decideTileInteractionState([])).toBeNull();
  });
});
