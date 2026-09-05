import { describe, expect, it } from "vitest";

import { analyzeCheckRoll } from "./check-roll-analysis";

describe("check roll analysis", () => {
  it("uses all four rolled dice for RA, RB, and a positive critical", () => {
    expect(analyzeCheckRoll([6, 2, 4, 6])).toEqual({
      highestResult: 6,
      lowestResult: 2,
      critical: "positive",
    });
  });

  it("requires all four rolled dice to be 1 for a critical failure", () => {
    expect(analyzeCheckRoll([1, 1, 1, 1]).critical).toBe("failure");
    expect(analyzeCheckRoll([1, 1, 1, 2]).critical).toBeNull();
  });
});
