export const NORMAL_DIE_STEPS = [4, 6, 8, 10, 12] as const;

export type NormalDieStep = (typeof NORMAL_DIE_STEPS)[number];

export const DIE_STEPS = [...NORMAL_DIE_STEPS, 20] as const;

export type DieStep = (typeof DIE_STEPS)[number];

export function isDieStep(value: unknown): value is DieStep {
  return typeof value === "number" && DIE_STEPS.includes(value as DieStep);
}

export function adjustDieStep(
  die: DieStep,
  adjustment: number,
): DieStep {
  if (!Number.isInteger(adjustment)) {
    throw new Error("Die step adjustment must be an integer.");
  }

  if (die === 20) return die;

  const currentIndex = NORMAL_DIE_STEPS.indexOf(die);
  const adjustedIndex = Math.min(
    NORMAL_DIE_STEPS.length - 1,
    Math.max(0, currentIndex + adjustment),
  );

  return NORMAL_DIE_STEPS[adjustedIndex] as NormalDieStep;
}
