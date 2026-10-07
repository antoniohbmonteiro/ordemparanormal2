import type { CheckOutcome } from "../checks/check";

export interface BreakAttempt {
  readonly number: number;
  readonly outcome: CheckOutcome;
  readonly addedRA: number;
  readonly remaining: number;
}

export interface BreakState {
  readonly pa: number;
  readonly accumulatedRA: number;
  readonly history: readonly BreakAttempt[];
  readonly status: "active" | "completed" | "cancelled";
}

export function remainingBreakResistance(state: BreakState): number {
  return Math.max(state.pa - state.accumulatedRA, 0);
}

export function createBreakState(pa: number): BreakState {
  if (!Number.isInteger(pa) || pa < 1) throw new Error("Configured PA must be a positive integer.");
  return { pa, accumulatedRA: 0, history: [], status: "active" };
}

export function recordBreakAttempt(state: BreakState, outcome: CheckOutcome, ra: number): BreakState {
  if (state.status !== "active") throw new Error("Break attempt is unavailable.");
  if (!Number.isInteger(ra) || ra < 1) throw new Error("RA must be a positive die result.");
  const addedRA = outcome === "success" ? ra : 0;
  const accumulatedRA = state.accumulatedRA + addedRA;
  const remaining = Math.max(state.pa - accumulatedRA, 0);
  return { ...state, accumulatedRA, status: remaining === 0 ? "completed" : "active",
    history: [...state.history, { number: state.history.length + 1, outcome, addedRA, remaining }] };
}
