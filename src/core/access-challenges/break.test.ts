import { describe, expect, it } from "vitest";
import { createBreakState, recordBreakAttempt, remainingBreakResistance } from "./break";
import { getCheckRA } from "../checks/check-roll-analysis";

describe("Arrombar", () => {
  it("derives RA from every resolved die, including an extra die", () => {
    expect(getCheckRA({ components: [{ result: 4 }, { result: 6 }], extraDice: [{ result: 10 }] })).toBe(10);
  });

  it("records no progress on failure and accumulates RA on success until PA", () => {
    const initial = createBreakState(10);
    const failed = recordBreakAttempt(initial, "failure", 8);
    expect(failed.accumulatedRA).toBe(0);
    expect(failed.history[0]).toEqual({ number: 1, outcome: "failure", addedRA: 0, remaining: 10 });
    const progressed = recordBreakAttempt(failed, "success", 4);
    expect(remainingBreakResistance(progressed)).toBe(6);
    const completed = recordBreakAttempt(progressed, "success", 8);
    expect(completed.status).toBe("completed");
    expect(remainingBreakResistance(completed)).toBe(0);
    expect(completed.history[2]).toMatchObject({ number: 3, addedRA: 8, remaining: 0 });
    expect(() => recordBreakAttempt(completed, "success", 1)).toThrow();
  });
});
