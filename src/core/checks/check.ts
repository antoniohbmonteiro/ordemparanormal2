import {
  adjustDieStep,
  NORMAL_DIE_STEPS,
  type DieStep,
  type NormalDieStep,
} from "../dice/die-step";

export type CheckKind = "attribute" | "skill" | "aptitude";
export type CheckComponentKind = "attribute" | "skill" | "specialization";
export type CheckOutcome = "success" | "failure";

export interface CheckMetadata {
  readonly kind: CheckKind;
  readonly key: string;
  readonly name: string;
}

export interface CheckComponentInput {
  readonly kind: CheckComponentKind;
  readonly key: string;
  readonly label: string;
  readonly die: DieStep;
}

export interface CheckExtraDieInput {
  readonly id: string;
  readonly die: NormalDieStep;
  readonly source: "situational";
  readonly label: string;
}

export interface CheckInput {
  readonly check: CheckMetadata;
  readonly components: readonly CheckComponentInput[];
  readonly extraDice: readonly CheckExtraDieInput[];
}

export interface CheckComponentOutcome {
  readonly key: string;
  readonly die: DieStep;
  readonly result: number;
}

export interface CheckExtraDieOutcome {
  readonly id: string;
  readonly die: NormalDieStep;
  readonly result: number;
}

export interface CheckRollOutcomes {
  readonly components: readonly CheckComponentOutcome[];
  readonly extraDice: readonly CheckExtraDieOutcome[];
}

export interface ResolvedCheckComponent extends CheckComponentInput {
  readonly result: number;
}

export interface ResolvedCheckExtraDie extends CheckExtraDieInput {
  readonly result: number;
}

export interface CheckResult {
  readonly check: CheckMetadata;
  readonly components: readonly ResolvedCheckComponent[];
  readonly extraDice: readonly ResolvedCheckExtraDie[];
  readonly total: number;
}

export interface CheckDifficultyResolution {
  readonly difficulty: number;
  readonly outcome: CheckOutcome;
}

export type CheckStepAdjustments = Readonly<Record<string, number>>;

export const MAX_CHECK_DICE = 4;

export function applyCheckStepAdjustments(
  input: CheckInput,
  adjustments: CheckStepAdjustments,
): CheckInput {
  const adjustmentKeys = Object.keys(adjustments);

  if (
    adjustmentKeys.length !== input.components.length ||
    input.components.some(({ key }) => !Object.hasOwn(adjustments, key))
  ) {
    throw new Error("Check step adjustments must match its components.");
  }

  return {
    check: { ...input.check },
    components: input.components.map((component) => ({
      ...component,
      die: adjustDieStep(component.die, adjustments[component.key] as number),
    })),
    extraDice: input.extraDice.map((extraDie) => ({ ...extraDie })),
  };
}

export function applyCheckExtraDice(
  input: CheckInput,
  extraDice: readonly CheckExtraDieInput[],
): CheckInput {
  assertValidCheckDice(input.components, extraDice);

  return {
    check: { ...input.check },
    components: input.components.map((component) => ({ ...component })),
    extraDice: extraDice.map((extraDie) => ({ ...extraDie })),
  };
}

export function resolveCheckDifficulty(
  total: number,
  difficulty: number,
): CheckDifficultyResolution {
  if (!Number.isInteger(difficulty) || difficulty < 1) {
    throw new Error("Check difficulty must be a positive integer.");
  }

  if (!Number.isFinite(total)) {
    throw new Error("Check total must be finite.");
  }

  return {
    difficulty,
    outcome: total >= difficulty ? "success" : "failure",
  };
}

function assertUniqueComponentKeys(
  components: readonly CheckComponentInput[],
): void {
  const keys = components.map(({ key }) => key);

  if (new Set(keys).size !== keys.length) {
    throw new Error("Check component keys must be unique.");
  }
}

function assertValidCheckDice(
  components: readonly CheckComponentInput[],
  extraDice: readonly CheckExtraDieInput[],
): void {
  if (components.length === 0) {
    throw new Error("A check must contain at least one component.");
  }

  if (components.length + extraDice.length > MAX_CHECK_DICE) {
    throw new Error(`A check cannot roll more than ${MAX_CHECK_DICE} dice.`);
  }

  assertUniqueComponentKeys(components);

  const extraDieIds = extraDice.map(({ id }) => id);

  if (extraDieIds.some((id) => id.trim() === "")) {
    throw new Error("Check extra dice must have non-empty IDs.");
  }

  if (new Set(extraDieIds).size !== extraDieIds.length) {
    throw new Error("Check extra die IDs must be unique.");
  }

  for (const extraDie of extraDice) {
    if (!NORMAL_DIE_STEPS.includes(extraDie.die)) {
      throw new Error("Situational extra dice must use a normal die step.");
    }

    if (extraDie.source !== "situational") {
      throw new Error("Unsupported check extra die source.");
    }

    if (extraDie.label.trim() === "") {
      throw new Error("Check extra dice must have a label.");
    }
  }
}

export function getContributingResultIndexes(
  results: readonly number[],
): readonly number[] {
  if (results.length === 0 || results.length > MAX_CHECK_DICE) {
    throw new Error("Check totals require between one and four results.");
  }

  if (results.some((result) => !Number.isInteger(result) || result < 1)) {
    throw new Error("Check total results must be positive integers.");
  }

  if (results.length < MAX_CHECK_DICE) {
    return results.map((_, index) => index);
  }

  return results
    .map((result, index) => ({ index, result }))
    .sort(
      (left, right) =>
        right.result - left.result || left.index - right.index,
    )
    .slice(0, 3)
    .map(({ index }) => index)
    .sort((left, right) => left - right);
}

export function calculateCheckTotal(results: readonly number[]): number {
  return getContributingResultIndexes(results).reduce(
    (sum, index) => sum + (results[index] as number),
    0,
  );
}

export function composeAttributeCheck(
  attribute: CheckComponentInput & { readonly kind: "attribute" },
): CheckInput {
  return {
    check: {
      kind: "attribute",
      key: attribute.key,
      name: attribute.label,
    },
    components: [attribute],
    extraDice: [],
  };
}

export function composeSkillCheck(
  check: CheckMetadata & { readonly kind: "skill" | "aptitude" },
  attribute: CheckComponentInput & { readonly kind: "attribute" },
  skill: CheckComponentInput & {
    readonly kind: "skill" | "specialization";
  },
): CheckInput {
  const components = [attribute, skill] as const;
  assertUniqueComponentKeys(components);

  return { check, components, extraDice: [] };
}

export function resolveCheck(
  input: CheckInput,
  outcomes: CheckRollOutcomes,
): CheckResult {
  assertValidCheckDice(input.components, input.extraDice);

  if (outcomes.components.length !== input.components.length) {
    throw new Error("Check outcome count does not match its components.");
  }

  if (outcomes.extraDice.length !== input.extraDice.length) {
    throw new Error("Check outcome count does not match its extra dice.");
  }

  const components = input.components.map(
    (component, index): ResolvedCheckComponent => {
      const outcome = outcomes.components[index];

      if (!outcome || outcome.key !== component.key) {
        throw new Error("Check outcome order does not match its components.");
      }

      if (outcome.die !== component.die) {
        throw new Error(`Check outcome die does not match ${component.key}.`);
      }

      if (
        !Number.isInteger(outcome.result) ||
        outcome.result < 1 ||
        outcome.result > component.die
      ) {
        throw new Error(`Invalid result for d${component.die}.`);
      }

      return { ...component, result: outcome.result };
    },
  );

  const extraDice = input.extraDice.map(
    (extraDie, index): ResolvedCheckExtraDie => {
      const outcome = outcomes.extraDice[index];

      if (!outcome || outcome.id !== extraDie.id) {
        throw new Error("Check outcome order does not match its extra dice.");
      }

      if (outcome.die !== extraDie.die) {
        throw new Error(`Check outcome die does not match ${extraDie.id}.`);
      }

      if (
        !Number.isInteger(outcome.result) ||
        outcome.result < 1 ||
        outcome.result > extraDie.die
      ) {
        throw new Error(`Invalid result for d${extraDie.die}.`);
      }

      return { ...extraDie, result: outcome.result };
    },
  );

  return {
    check: { ...input.check },
    components,
    extraDice,
    total: calculateCheckTotal([
      ...components.map(({ result }) => result),
      ...extraDice.map(({ result }) => result),
    ]),
  };
}
