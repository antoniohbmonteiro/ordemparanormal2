import { describe, expect, it } from "vitest";
import { validateUnlockConfig } from "../../application/access-challenges/configuration";
import { advanceUnlockRound, attemptsFromCrimeDie, compareUnlockGuess, createUnlockState,
  generateUnlockSecret, submitUnlockGuess } from "./unlock";

const common = { participant: { kind: "actor" as const, uuid: "Actor.agent" as const },
  obstacle: "", die: 6 as const, resistance: 3,
  secretMode: "manual" as const, manualSecret: [3, 5, 2] };

describe("Destrancar", () => {
  it("validates v1 complexity and positive resistance at configuration, without imposing six slots on core", () => {
    expect(() => validateUnlockConfig({ ...common, diceCount: 3 })).not.toThrow();
    expect(() => validateUnlockConfig({ ...common, diceCount: 7, manualSecret: [1, 1, 1, 1, 1, 1, 1] })).toThrow();
    expect(() => validateUnlockConfig({ ...common, diceCount: 3, resistance: 0 })).toThrow();
    expect(() => validateUnlockConfig({ ...common, diceCount: 3, resistance: 1000 })).not.toThrow();
    expect(compareUnlockGuess([1, 2, 3, 4, 5, 6, 1], [1, 2, 3, 4, 5, 6, 1], 6)).toHaveLength(7);
  });

  it("validates faces, creates the requested number of random positions and uses canonical feedback", () => {
    expect(generateUnlockSecret(3, 6, () => 4)).toEqual([4, 4, 4]);
    expect(() => generateUnlockSecret(0, 6, () => 1)).toThrow();
    expect(() => generateUnlockSecret(1, 6, () => 7)).toThrow();
    expect(() => compareUnlockGuess([3], [7], 6)).toThrow();
    expect(() => compareUnlockGuess([3, 5], [3], 6)).toThrow();
    expect(compareUnlockGuess([3, 5, 2], [4, 5, 1], 6)).toEqual(["low", "exact", "high"]);
  });

  it("freezes Crime and advances only at the exact round limit while preserving totals and history", () => {
    expect([4, 6, 8, 10, 12].map(die => attemptsFromCrimeDie(die as 4 | 6 | 8 | 10 | 12))).toEqual([1, 2, 3, 4, 5]);
    const initial = createUnlockState([3, 5, 2], 6, 4, 6);
    expect(() => advanceUnlockRound(initial)).toThrow();
    const first = submitUnlockGuess(initial, [4, 5, 1]);
    expect(() => advanceUnlockRound(first)).toThrow();
    const exhausted = submitUnlockGuess(first, [4, 5, 1]);
    expect(() => submitUnlockGuess(exhausted, [3, 5, 2])).toThrow();
    const advanced = advanceUnlockRound(exhausted);
    expect(advanced).toMatchObject({ round: 2, attemptsThisRound: 0, attemptsUsed: 2, attemptsPerRound: 2, crimeDie: 6 });
    expect(advanced.history).toEqual(exhausted.history);
  });

  it("succeeds only when all slots are exact, including the last total attempt", () => {
    const initial = createUnlockState([3, 5, 2], 6, 1, 6);
    expect(submitUnlockGuess(initial, [3, 5, 2]).status).toBe("success");
    expect(submitUnlockGuess(initial, [3, 5, 1]).status).toBe("jammed");
    expect(() => submitUnlockGuess(submitUnlockGuess(initial, [3, 5, 2]), [3, 5, 2])).toThrow();
  });
});
