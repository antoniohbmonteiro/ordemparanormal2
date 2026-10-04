import { describe, expect, it } from "vitest";
import { changeRadioPuzzle, isRadioPuzzleConfig, prepareRadioPuzzle, radioPuzzleSucceeded, radioRemovalCount } from "./radio-puzzle";

describe("radio puzzle", () => {
  it.each([[6, 0], [7, 2], [9, 2], [10, 3], [12, 3], [13, 5]])("removes exactly the threshold count at %s", (total, count) => {
    expect(radioRemovalCount(total!, 5)).toBe(count);
  });
  it.each([0, 1, 2])("caps removal by the actual %s false pieces", count => {
    for (const total of [6, 7, 9, 10, 12, 13])
      expect(radioRemovalCount(total, count)).toBe(total <= 6 ? 0 : Math.min(total <= 9 ? 2 : total <= 12 ? 3 : count, count));
  });
  const config = { type: "radio" as const, trueFragments: ["o", "sinal", "o"], falseFragments: ["x", "y", "z", "w"] };
  it("validates nonempty texts and prevents invisible false/true collisions", () => {
    expect(isRadioPuzzleConfig(config)).toBe(true);
    for (const invalid of [{ ...config, trueFragments: [] }, { ...config, falseFragments: [" o "] },
      { ...config, trueFragments: [" "] }, { ...config, sequenceLength: 4 }]) expect(isRadioPuzzleConfig(invalid)).toBe(false);
  });
  it("removes only false pieces without replacement and assigns opaque tokens", () => {
    let id = 0;
    const puzzle = prepareRadioPuzzle(config, 10, () => 0.5, () => `token-${++id}`);
    expect(puzzle.removedCount).toBe(3);
    expect(puzzle.active).toHaveLength(4);
    expect(puzzle.active.filter(piece => config.falseFragments.includes(piece.text))).toHaveLength(1);
    expect(puzzle.active.filter(piece => piece.text === "o")).toHaveLength(2);
    expect(Object.keys(puzzle.active[0]!)).toEqual(["id", "text"]);
  });
  it("moves, discards and restores at the end without modifying inputs", () => {
    const initial = { active: [{ id: "a", text: "o" }, { id: "b", text: "sinal" }, { id: "c", text: "o" }], discarded: [] };
    const discarded = changeRadioPuzzle(initial, "discard", "b");
    const restored = changeRadioPuzzle(discarded, "restore", "b");
    expect(restored.active.map(piece => piece.id)).toEqual(["a", "c", "b"]);
    const correct = changeRadioPuzzle(restored, "move", "b", -1);
    expect(radioPuzzleSucceeded(config, correct)).toBe(true);
    expect(initial.active.map(piece => piece.id)).toEqual(["a", "b", "c"]);
    expect(radioPuzzleSucceeded(config, { active: [], discarded: initial.active })).toBe(false);
    expect(() => changeRadioPuzzle(initial, "move", "a", -1)).toThrow();
    expect(() => changeRadioPuzzle(initial, "restore", "hidden")).toThrow();
  });
});
