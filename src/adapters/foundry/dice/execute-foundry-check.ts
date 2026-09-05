import {
  resolveCheck,
  type CheckComponentOutcome,
  type CheckExtraDieOutcome,
  type CheckInput,
  type CheckResult,
} from "../../../core/checks/check";

export interface FoundryCheckExecution {
  readonly result: CheckResult;
  readonly roll: foundry.dice.Roll;
}

export async function executeFoundryCheck(
  input: CheckInput,
): Promise<FoundryCheckExecution> {
  const dice = [...input.components, ...input.extraDice];
  const formula = dice
    .map(({ die }) => `1d${die}`)
    .join(" + ");
  const roll = await Roll.create(formula).evaluate({
    allowInteractive: false,
  });

  if (roll.dice.length !== dice.length) {
    throw new Error("Foundry Roll term count does not match check dice.");
  }

  const rolledResults = roll.dice.map((term, index): number => {
    const die = dice[index];

    if (!die || term.faces !== die.die) {
      throw new Error("Foundry Roll faces do not match check dice.");
    }

    const activeResults = term.results.filter(
      (result) => result.active !== false && !result.discarded,
    );

    if (activeResults.length !== 1 || !activeResults[0]) {
      throw new Error("Each check die must resolve exactly one result.");
    }

    return activeResults[0].result;
  });
  const componentOutcomes: CheckComponentOutcome[] = input.components.map(
    (component, index) => ({
      key: component.key,
      die: component.die,
      result: rolledResults[index] as number,
    }),
  );
  const extraDieOutcomes: CheckExtraDieOutcome[] = input.extraDice.map(
    (extraDie, index) => ({
      id: extraDie.id,
      die: extraDie.die,
      result: rolledResults[input.components.length + index] as number,
    }),
  );
  const result = resolveCheck(input, {
    components: componentOutcomes,
    extraDice: extraDieOutcomes,
  });
  const rawTotal = rolledResults.reduce(
    (sum, rolledResult) => sum + rolledResult,
    0,
  );

  if (roll.total !== rawTotal) {
    throw new Error("Foundry Roll total does not match its individual dice.");
  }

  if (dice.length < 4 && rawTotal !== result.total) {
    throw new Error("Foundry Roll total does not match the resolved check.");
  }

  return { result, roll };
}
