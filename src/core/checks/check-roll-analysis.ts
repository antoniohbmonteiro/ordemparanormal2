export type CheckCriticalState = "positive" | "failure" | null;

export interface CheckRollAnalysis {
  readonly highestResult: number;
  readonly lowestResult: number;
  readonly critical: CheckCriticalState;
}

export function analyzeCheckRoll(
  results: readonly number[],
): CheckRollAnalysis {
  const firstResult = results[0];

  if (firstResult === undefined) {
    throw new Error("Check roll analysis requires at least one result.");
  }

  let highestResult = firstResult;
  let lowestResult = firstResult;
  let criticalFailure = true;
  let positiveCritical = false;
  const frequencies = new Map<number, number>();

  for (const result of results) {
    if (!Number.isInteger(result) || result < 1) {
      throw new Error("Check roll results must be positive integers.");
    }

    highestResult = Math.max(highestResult, result);
    lowestResult = Math.min(lowestResult, result);
    criticalFailure &&= result === 1;

    const frequency = (frequencies.get(result) ?? 0) + 1;
    frequencies.set(result, frequency);

    if (result >= 6 && frequency >= 2) {
      positiveCritical = true;
    }
  }

  return {
    highestResult,
    lowestResult,
    critical: criticalFailure
      ? "failure"
      : positiveCritical
        ? "positive"
        : null,
  };
}
