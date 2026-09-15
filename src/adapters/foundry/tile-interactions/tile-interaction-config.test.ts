import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTileInteractionFlagUpdate,
  EMPTY_TILE_INTERACTION_CONFIG,
  parseTileInteractionConfig,
  readTileInteractionConfig,
  TILE_INTERACTION_FLAG_PATH,
} from "./tile-interaction-config";

afterEach(() => vi.unstubAllGlobals());

describe("Tile interaction configuration", () => {
  it.each([null, [], true, {}, {
    enabled: "yes", wallIds: ["w1"], tileIds: [],
  }, { enabled: false, wallIds: {}, tileIds: [] }])(
    "rejects malformed data: %j",
    value => expect(parseTileInteractionConfig(value)).toBeNull(),
  );

  it("deduplicates valid IDs and ignores malformed array entries", () => {
    expect(parseTileInteractionConfig({
      enabled: true,
      wallIds: ["w1", "w1", "", "  ", 1, null, "w2"],
      tileIds: ["t1", false, "t1"],
    })).toEqual({ enabled: true, wallIds: ["w1", "w2"], tileIds: ["t1"] });
  });

  it("accepts an enabled control with no Wall or Tile targets", () => {
    expect(parseTileInteractionConfig({
      enabled: true, wallIds: [], tileIds: [],
    })).toEqual({ enabled: true, wallIds: [], tileIds: [] });
  });

  it("treats an absent flag as disabled", () => {
    const getFlag = vi.fn(() => undefined);
    expect(readTileInteractionConfig({ getFlag })).toBe(EMPTY_TILE_INTERACTION_CONFIG);
    expect(getFlag).toHaveBeenCalledExactlyOnceWith("ordemparanormal2", "tileInteraction");
  });

  it("replaces the entire configured object", () => {
    const create = vi.fn((value: unknown) => ({ replacement: value }));
    class ForcedDeletion {}
    vi.stubGlobal("foundry", { data: { operators: {
      ForcedDeletion,
      ForcedReplacement: { create },
    } } });
    const update = buildTileInteractionFlagUpdate({
      enabled: false, wallIds: ["w2"], tileIds: [],
    });
    expect(update).toEqual({
      [TILE_INTERACTION_FLAG_PATH]: {
        replacement: { enabled: false, wallIds: ["w2"], tileIds: [] },
      },
    });
  });

  it("preserves an enabled empty control instead of deleting its flag", () => {
    const create = vi.fn((value: unknown) => ({ replacement: value }));
    vi.stubGlobal("foundry", { data: { operators: {
      ForcedDeletion: class ForcedDeletion {},
      ForcedReplacement: { create },
    } } });
    expect(buildTileInteractionFlagUpdate({
      enabled: true, wallIds: [], tileIds: [],
    })).toEqual({
      [TILE_INTERACTION_FLAG_PATH]: {
        replacement: { enabled: true, wallIds: [], tileIds: [] },
      },
    });
  });

  it("deletes a disabled empty flag", () => {
    class ForcedDeletion {}
    vi.stubGlobal("foundry", { data: { operators: {
      ForcedDeletion,
      ForcedReplacement: { create: vi.fn() },
    } } });
    expect(buildTileInteractionFlagUpdate(EMPTY_TILE_INTERACTION_CONFIG)).toEqual({
      [TILE_INTERACTION_FLAG_PATH]: expect.any(ForcedDeletion),
    });
    expect(TILE_INTERACTION_FLAG_PATH).toBe(
      "flags.ordemparanormal2.tileInteraction",
    );
  });
});
