import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  analyzeCheckRoll,
  type CheckCriticalState,
} from "../core/checks/check-roll-analysis";
import { getContributingResultIndexes } from "../core/checks/check";
import { publishCheckMessage } from "../adapters/foundry/chat/publish-check-message";
import {
  publishCheckScenario,
  type CheckQaScenarioKey,
} from "./check-scenarios";

vi.mock("../adapters/foundry/chat/publish-check-message", () => ({
  publishCheckMessage: vi.fn(),
}));

interface ExpectedScenario {
  readonly key: CheckQaScenarioKey;
  readonly dice: readonly number[];
  readonly results: readonly number[];
  readonly total: number;
  readonly difficulty: number;
  readonly outcome: "success" | "failure";
  readonly critical: CheckCriticalState;
  readonly contributingIndexes: readonly number[];
}

const EXPECTED_SCENARIOS: readonly ExpectedScenario[] = [
  {
    key: "positiveCritical",
    dice: [10, 10, 4],
    results: [8, 8, 3],
    total: 19,
    difficulty: 20,
    outcome: "failure",
    critical: "positive",
    contributingIndexes: [0, 1, 2],
  },
  {
    key: "criticalFailure",
    dice: [10, 10],
    results: [1, 1],
    total: 2,
    difficulty: 1,
    outcome: "success",
    critical: "failure",
    contributingIndexes: [0, 1],
  },
  {
    key: "excludedFourth",
    dice: [6, 8, 12, 4],
    results: [5, 8, 11, 3],
    total: 24,
    difficulty: 24,
    outcome: "success",
    critical: null,
    contributingIndexes: [0, 1, 2],
  },
  {
    key: "cutoffTie",
    dice: [10, 8, 4, 4],
    results: [8, 6, 3, 3],
    total: 17,
    difficulty: 18,
    outcome: "failure",
    critical: null,
    contributingIndexes: [0, 1, 2],
  },
];

beforeEach(() => {
  vi.mocked(publishCheckMessage).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("Roll", {
    create: vi.fn((formula: string) => ({
      evaluate: vi.fn().mockResolvedValue({
        formula,
        total: formula
          .split(" + ")
          .map(Number)
          .reduce((sum, result) => sum + result, 0),
      }),
    })),
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "ordemparanormal2Qa");
  vi.unstubAllGlobals();
});

describe("named Check QA scenarios", () => {
  it.each(EXPECTED_SCENARIOS)(
    "publishes $key through the real Check resolution path",
    async (expected) => {
      const actor = { id: "qa-actor" } as unknown as foundry.documents.Actor;

      await publishCheckScenario(actor, expected.key);

      expect(Roll.create).toHaveBeenCalledWith(expected.results.join(" + "));
      expect(publishCheckMessage).toHaveBeenCalledOnce();
      const [publishedActor, execution, resolution] = vi.mocked(
        publishCheckMessage,
      ).mock.calls[0] as Parameters<typeof publishCheckMessage>;
      const dice = [
        ...execution.result.components.map(({ die }) => die),
        ...execution.result.extraDice.map(({ die }) => die),
      ];
      const results = [
        ...execution.result.components.map(({ result }) => result),
        ...execution.result.extraDice.map(({ result }) => result),
      ];

      expect(publishedActor).toBe(actor);
      expect(dice).toEqual(expected.dice);
      expect(results).toEqual(expected.results);
      expect(execution.result.total).toBe(expected.total);
      expect(resolution).toEqual({
        difficulty: expected.difficulty,
        outcome: expected.outcome,
      });
      expect(analyzeCheckRoll(results).critical).toBe(expected.critical);
      expect(getContributingResultIndexes(results)).toEqual(
        expected.contributingIndexes,
      );
    },
  );

  it("rejects unknown keys instead of becoming a generic scenario API", async () => {
    const actor = {} as foundry.documents.Actor;

    await expect(
      publishCheckScenario(actor, "arbitrary" as CheckQaScenarioKey),
    ).rejects.toThrow("Unknown Check QA scenario");

    expect(Roll.create).not.toHaveBeenCalled();
    expect(publishCheckMessage).not.toHaveBeenCalled();
  });

});
