export type LaboratoryLength = 4 | 5 | 6;
export type LaboratoryDie = 4 | 6 | 8 | 10 | 12;
const ladder: readonly LaboratoryDie[] = [4, 6, 8, 10, 12];
export interface LaboratorySequence {
  readonly dice: readonly LaboratoryDie[];
  readonly results: readonly number[];
  readonly remaining: number;
}
export function laboratoryDice(length: LaboratoryLength, ceiling: number): readonly LaboratoryDie[] {
  if (![4, 5, 6].includes(length) || !ladder.includes(ceiling as LaboratoryDie))
    throw new Error("Invalid laboratory configuration.");
  return Array.from({ length }, (_, index) => ladder[Math.min(index, ladder.indexOf(ceiling as LaboratoryDie))]!);
}
export function laboratoryBudget(mind: number): number {
  if (![4, 6, 8, 10, 12, 20].includes(mind)) throw new Error("Invalid laboratory mind die.");
  return mind / 2;
}
/** Indices of the later die in each broken adjacent comparison. */
export function laboratoryBreaks(results: readonly number[]): readonly number[] {
  return results.flatMap((value, index) => index > 0 && value < results[index - 1]! ? [index] : []);
}
export function validLaboratorySelection(state: LaboratorySequence, positions: readonly number[]): boolean {
  return positions.length > 0 && positions.length <= state.remaining && new Set(positions).size === positions.length
    && positions.every(index => Number.isInteger(index) && index >= 0 && index < state.dice.length);
}
export function applyLaboratoryReroll(state: LaboratorySequence, positions: readonly number[],
  values: readonly number[]): LaboratorySequence {
  if (!validLaboratorySelection(state, positions) || values.length !== positions.length
    || values.some((value, index) => !Number.isInteger(value) || value < 1 || value > state.dice[positions[index]!]!))
    throw new Error("Invalid laboratory reroll.");
  const results = [...state.results];
  positions.forEach((position, index) => { results[position] = values[index]!; });
  return { dice: [...state.dice], results, remaining: state.remaining - positions.length };
}
