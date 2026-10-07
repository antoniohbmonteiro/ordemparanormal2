import type { NormalDieStep } from "../dice/die-step";

export type UnlockFeedback = "low" | "exact" | "high";
export type UnlockStatus = "active" | "success" | "jammed" | "cancelled";

export interface UnlockAttempt {
  readonly number: number;
  readonly round: number;
  readonly guess: readonly number[];
  readonly feedback: readonly UnlockFeedback[];
}

export interface UnlockState {
  readonly secret: readonly number[];
  readonly die: NormalDieStep;
  readonly resistance: number;
  readonly crimeDie: NormalDieStep;
  readonly attemptsPerRound: number;
  readonly round: number;
  readonly attemptsThisRound: number;
  readonly attemptsUsed: number;
  readonly history: readonly UnlockAttempt[];
  readonly status: UnlockStatus;
}

export function validateUnlockValues(values: readonly number[], die: NormalDieStep): void {
  if (values.length === 0 || values.some(value => !Number.isInteger(value) || value < 1 || value > die)) {
    throw new Error("Unlock values must be a non-empty sequence of valid die faces.");
  }
}

export function compareUnlockGuess(secret: readonly number[], guess: readonly number[], die: NormalDieStep): readonly UnlockFeedback[] {
  validateUnlockValues(secret, die);
  validateUnlockValues(guess, die);
  if (secret.length !== guess.length) throw new Error("Unlock guess length must match the secret.");
  return guess.map((value, index) => value > secret[index]! ? "low" : value < secret[index]! ? "high" : "exact");
}

export function generateUnlockSecret(count: number, die: NormalDieStep, randomFace: (faces: number) => number): readonly number[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("Unlock secret must be non-empty.");
  return Array.from({ length: count }, () => {
    const face = randomFace(die);
    if (!Number.isInteger(face) || face < 1 || face > die) throw new Error("Invalid random die face.");
    return face;
  });
}

export function attemptsFromCrimeDie(die: NormalDieStep): number {
  return ({ 4: 1, 6: 2, 8: 3, 10: 4, 12: 5 } as const)[die];
}

export function createUnlockState(secret: readonly number[], die: NormalDieStep, resistance: number, crimeDie: NormalDieStep): UnlockState {
  validateUnlockValues(secret, die);
  return { secret: [...secret], die, resistance, crimeDie, attemptsPerRound: attemptsFromCrimeDie(crimeDie),
    round: 1, attemptsThisRound: 0, attemptsUsed: 0, history: [], status: "active" };
}

export function submitUnlockGuess(state: UnlockState, guess: readonly number[]): UnlockState {
  if (state.status !== "active" || state.attemptsThisRound >= state.attemptsPerRound || state.attemptsUsed >= state.resistance) {
    throw new Error("Unlock attempt is unavailable.");
  }
  const feedback = compareUnlockGuess(state.secret, guess, state.die);
  const attemptsUsed = state.attemptsUsed + 1;
  const success = feedback.every(result => result === "exact");
  const attempt: UnlockAttempt = { number: attemptsUsed, round: state.round, guess: [...guess], feedback };
  return { ...state, attemptsUsed, attemptsThisRound: state.attemptsThisRound + 1,
    history: [...state.history, attempt], status: success ? "success" : attemptsUsed === state.resistance ? "jammed" : "active" };
}

export function advanceUnlockRound(state: UnlockState): UnlockState {
  if (state.status !== "active" || state.attemptsThisRound !== state.attemptsPerRound || state.attemptsUsed >= state.resistance) {
    throw new Error("Unlock round cannot advance.");
  }
  return { ...state, round: state.round + 1, attemptsThisRound: 0 };
}
