import { describe, expect, it } from "vitest";
import { applyLaboratoryReroll, laboratoryBreaks, laboratoryBudget, laboratoryDice,
  validLaboratorySelection } from "./laboratory-challenge";

describe("laboratory challenge", () => {
  it.each([4, 5, 6] as const)("builds %i dice at every normal ceiling", length => {
    for (const ceiling of [4, 6, 8, 10, 12]) {
      const dice = laboratoryDice(length, ceiling);
      expect(dice).toHaveLength(length);
      expect(dice[0]).toBe(4);
      expect(dice.at(-1)).toBe(Math.min(ceiling, 4 + (length - 1) * 2));
      expect(Math.max(...dice)).toBeLessThanOrEqual(ceiling);
    }
  });
  it("uses each selected position as cost and replaces even a higher previous result", () => {
    const state = { dice: laboratoryDice(4, 8), results: [4, 6, 8, 8], remaining: 3 };
    expect(applyLaboratoryReroll(state, [0, 2, 3], [1, 2, 3])).toEqual({ ...state, results: [1, 6, 2, 3], remaining: 0 });
    expect(state.results).toEqual([4, 6, 8, 8]);
  });
  it.each([[], [0, 0], [-1], [4], [0.5], [0, 1, 2]].map(positions => ({ positions })))("rejects invalid selection $positions", ({ positions }) => {
    expect(validLaboratorySelection({ dice: laboratoryDice(4, 4), results: [1, 1, 1, 1], remaining: 2 }, positions)).toBe(false);
  });
  it("allows equality and reports only broken comparisons", () => {
    expect(laboratoryBreaks([2, 2, 3, 4, 4, 4])).toEqual([]);
    expect(laboratoryBreaks([4, 3, 5, 2])).toEqual([1, 3]);
    expect(laboratoryBudget(6)).toBe(3);
    expect(laboratoryBudget(20)).toBe(10);
    expect(() => laboratoryDice(4, 20)).toThrow();
  });
});
