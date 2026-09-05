import { publishCheckMessage } from "../adapters/foundry/chat/publish-check-message";
import {
  resolveCheck,
  resolveCheckDifficulty,
  type CheckInput,
  type CheckRollOutcomes,
} from "../core/checks/check";

export type CheckQaScenarioKey =
  | "positiveCritical"
  | "criticalFailure"
  | "excludedFourth"
  | "cutoffTie";

interface CheckQaScenario {
  readonly input: CheckInput;
  readonly outcomes: CheckRollOutcomes;
  readonly difficulty: number;
}

const BASE_CHECK = {
  check: { kind: "skill", key: "athletics", name: "Atletismo" },
} as const;

const CHECK_QA_SCENARIOS: Readonly<Record<CheckQaScenarioKey, CheckQaScenario>> = {
  positiveCritical: {
    input: {
      ...BASE_CHECK,
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 10 },
        { kind: "skill", key: "athletics", label: "Atletismo", die: 10 },
      ],
      extraDice: [
        {
          id: "qa-positive-critical",
          die: 4,
          source: "situational",
          label: "Situacional",
        },
      ],
    },
    outcomes: {
      components: [
        { key: "mind", die: 10, result: 8 },
        { key: "athletics", die: 10, result: 8 },
      ],
      extraDice: [{ id: "qa-positive-critical", die: 4, result: 3 }],
    },
    difficulty: 20,
  },
  criticalFailure: {
    input: {
      ...BASE_CHECK,
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 10 },
        { kind: "skill", key: "athletics", label: "Atletismo", die: 10 },
      ],
      extraDice: [],
    },
    outcomes: {
      components: [
        { key: "mind", die: 10, result: 1 },
        { key: "athletics", die: 10, result: 1 },
      ],
      extraDice: [],
    },
    difficulty: 1,
  },
  excludedFourth: {
    input: {
      ...BASE_CHECK,
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 6 },
        { kind: "skill", key: "athletics", label: "Atletismo", die: 8 },
      ],
      extraDice: [
        {
          id: "qa-excluded-d12",
          die: 12,
          source: "situational",
          label: "Situacional",
        },
        {
          id: "qa-excluded-d4",
          die: 4,
          source: "situational",
          label: "Situacional",
        },
      ],
    },
    outcomes: {
      components: [
        { key: "mind", die: 6, result: 5 },
        { key: "athletics", die: 8, result: 8 },
      ],
      extraDice: [
        { id: "qa-excluded-d12", die: 12, result: 11 },
        { id: "qa-excluded-d4", die: 4, result: 3 },
      ],
    },
    difficulty: 24,
  },
  cutoffTie: {
    input: {
      ...BASE_CHECK,
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 10 },
        { kind: "skill", key: "athletics", label: "Atletismo", die: 8 },
      ],
      extraDice: [
        {
          id: "qa-cutoff-first",
          die: 4,
          source: "situational",
          label: "Situacional",
        },
        {
          id: "qa-cutoff-second",
          die: 4,
          source: "situational",
          label: "Situacional",
        },
      ],
    },
    outcomes: {
      components: [
        { key: "mind", die: 10, result: 8 },
        { key: "athletics", die: 8, result: 6 },
      ],
      extraDice: [
        { id: "qa-cutoff-first", die: 4, result: 3 },
        { id: "qa-cutoff-second", die: 4, result: 3 },
      ],
    },
    difficulty: 18,
  },
};

function getScenarioResults(scenario: CheckQaScenario): readonly number[] {
  return [
    ...scenario.outcomes.components.map(({ result }) => result),
    ...scenario.outcomes.extraDice.map(({ result }) => result),
  ];
}

export async function publishCheckScenario(
  actor: foundry.documents.Actor,
  scenarioKey: CheckQaScenarioKey,
): Promise<void> {
  const scenario = CHECK_QA_SCENARIOS[scenarioKey];

  if (!scenario) {
    throw new Error(`Unknown Check QA scenario: ${String(scenarioKey)}`);
  }

  const result = resolveCheck(scenario.input, scenario.outcomes);
  const difficultyResolution = resolveCheckDifficulty(
    result.total,
    scenario.difficulty,
  );
  const roll = await Roll.create(getScenarioResults(scenario).join(" + ")).evaluate({
    allowInteractive: false,
  });

  if (getScenarioResults(scenario).length < 4 && roll.total !== result.total) {
    throw new Error("QA Roll total does not match the resolved Check scenario.");
  }

  await publishCheckMessage(actor, { result, roll }, difficultyResolution);
}
