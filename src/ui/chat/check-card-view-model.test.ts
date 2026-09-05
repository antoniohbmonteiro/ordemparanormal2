import { describe, expect, it } from "vitest";

import type {
  CheckSnapshotV1,
  CheckSnapshotV2,
  CheckSnapshotV3,
} from "../../application/checks/check-snapshot";
import { buildCheckCardViewModel } from "./check-card-view-model";

function createLegacyResult() {
  return {
    check: {
      kind: "skill" as const,
      key: "perception",
      name: "Percepção",
    },
    components: [
      {
        kind: "attribute" as const,
        key: "mind",
        label: "Mente",
        die: 8 as const,
        result: 5,
      },
      {
        kind: "skill" as const,
        key: "perception",
        label: "Percepção",
        die: 6 as const,
        result: 4,
      },
    ],
    total: 9,
  };
}

describe("check card view model", () => {
  it("uses resolved component labels and icons for an alternate-attribute skill check", () => {
    const snapshot: CheckSnapshotV3 = {
      schemaVersion: 3,
      check: { kind: "skill", key: "acrobatics", name: "Acrobacia" },
      components: [
        {
          kind: "attribute",
          key: "mind",
          label: "Mente",
          die: 6,
          result: 5,
        },
        {
          kind: "skill",
          key: "acrobatics",
          label: "Acrobacia",
          die: 8,
          result: 7,
        },
      ],
      extraDice: [],
      total: 12,
    };

    const viewModel = buildCheckCardViewModel(snapshot);

    expect(viewModel.subtitle).toBe("Mente + Acrobacia");
    expect(viewModel.dice).toEqual([
      {
        label: "Mente",
        dieLabel: "d6",
        result: 5,
        contributes: true,
        iconClass: "fa-solid fa-brain",
      },
      {
        label: "Acrobacia",
        dieLabel: "d8",
        result: 7,
        contributes: true,
        iconPath:
          "systems/ordemparanormal2/assets/icons/skills/acrobatics.svg",
      },
    ]);
  });

  it("omits a redundant subtitle for a pure attribute check", () => {
    const snapshot: CheckSnapshotV3 = {
      schemaVersion: 3,
      check: { kind: "attribute", key: "physical", name: "Físico" },
      components: [
        {
          kind: "attribute",
          key: "physical",
          label: "Físico",
          die: 8,
          result: 5,
        },
      ],
      extraDice: [],
      total: 5,
    };

    expect(buildCheckCardViewModel(snapshot).subtitle).toBeUndefined();
  });

  it("uses the Aptitude specialization icon instead of the generic icon", () => {
    const snapshot: CheckSnapshotV3 = {
      schemaVersion: 3,
      check: { kind: "aptitude", key: "arts", name: "Aptidão: Artes" },
      components: [
        {
          kind: "attribute",
          key: "emotion",
          label: "Emoção",
          die: 8,
          result: 5,
        },
        {
          kind: "specialization",
          key: "arts",
          label: "Artes",
          die: 6,
          result: 4,
        },
      ],
      extraDice: [],
      total: 9,
    };

    const viewModel = buildCheckCardViewModel(snapshot);

    expect(viewModel.subtitle).toBe("Emoção + Artes");
    expect(viewModel.dice[1]?.iconPath).toBe(
      "systems/ordemparanormal2/assets/icons/skills/aptitude/arts.svg",
    );
    expect(viewModel.dice[1]?.iconPath).not.toContain("/aptitude.svg");
  });

  it("supports a historical V1 snapshot with a contributing formula", () => {
    const snapshot: CheckSnapshotV1 = {
      schemaVersion: 1,
      ...createLegacyResult(),
    };

    const viewModel = buildCheckCardViewModel(snapshot);

    expect(viewModel.name).toBe("Percepção");
    expect(viewModel.contributingFormula).toBe("d8 + d6");
    expect(viewModel.dice.every(({ contributes }) => contributes)).toBe(true);
    expect(viewModel.resolution).toBeUndefined();
  });

  it("adds presentation state for a V2 snapshot with DT", () => {
    const snapshot: CheckSnapshotV2 = {
      schemaVersion: 2,
      ...createLegacyResult(),
      difficulty: 9,
      outcome: "success",
    };

    expect(buildCheckCardViewModel(snapshot).resolution).toEqual({
      difficulty: 9,
      outcome: "success",
      isSuccess: true,
    });
  });

  it("keeps all four rows for analysis while excluding only presentation metadata from the formula", () => {
    const snapshot: CheckSnapshotV3 = {
      schemaVersion: 3,
      ...createLegacyResult(),
      components: [
        {
          kind: "attribute",
          key: "mind",
          label: "Mente",
          die: 8,
          result: 6,
        },
        {
          kind: "skill",
          key: "perception",
          label: "Percepção",
          die: 6,
          result: 2,
        },
      ],
      extraDice: [
        {
          id: "situational-1",
          die: 4,
          source: "situational",
          label: "Situacional",
          result: 4,
        },
        {
          id: "situational-2",
          die: 8,
          source: "situational",
          label: "Situacional",
          result: 6,
        },
      ],
      total: 16,
      difficulty: 17,
      outcome: "failure",
    };

    const viewModel = buildCheckCardViewModel(snapshot);

    expect(viewModel.contributingFormula).toBe("d8 + d4 + d8");
    expect(viewModel.dice.map(({ contributes }) => contributes)).toEqual([
      true,
      false,
      true,
      true,
    ]);
    expect(viewModel.dice[2]?.iconPath).toBe(
      "systems/ordemparanormal2/assets/icons/dice/d4.svg",
    );
    expect(viewModel.rollAnalysis).toEqual({
      highestResult: 6,
      lowestResult: 2,
      isPositiveCritical: true,
      isCriticalFailure: false,
    });
    expect(viewModel.resolution?.outcome).toBe("failure");
  });

  it("uses original row order to break a tie around the cutoff", () => {
    const snapshot: CheckSnapshotV3 = {
      schemaVersion: 3,
      ...createLegacyResult(),
      components: [
        { ...createLegacyResult().components[0], result: 6 },
        { ...createLegacyResult().components[1], result: 4 },
      ],
      extraDice: [
        {
          id: "situational-1",
          die: 8,
          source: "situational",
          label: "Situacional",
          result: 4,
        },
        {
          id: "situational-2",
          die: 10,
          source: "situational",
          label: "Situacional",
          result: 4,
        },
      ],
      total: 14,
    };

    expect(
      buildCheckCardViewModel(snapshot).dice.map(({ contributes }) =>
        contributes,
      ),
    ).toEqual([true, true, true, false]);
  });

  it("uses all four dice to detect a critical failure", () => {
    const snapshot: CheckSnapshotV3 = {
      schemaVersion: 3,
      ...createLegacyResult(),
      components: createLegacyResult().components.map((component) => ({
        ...component,
        result: 1,
      })),
      extraDice: [
        {
          id: "situational-1",
          die: 4,
          source: "situational",
          label: "Situacional",
          result: 1,
        },
        {
          id: "situational-2",
          die: 6,
          source: "situational",
          label: "Situacional",
          result: 1,
        },
      ],
      total: 3,
    };

    expect(buildCheckCardViewModel(snapshot).rollAnalysis).toEqual({
      highestResult: 1,
      lowestResult: 1,
      isPositiveCritical: false,
      isCriticalFailure: true,
    });
  });

  it.each([
    { results: [6, 6] as const, outcome: "success" as const, critical: "positive" },
    { results: [6, 6] as const, outcome: "failure" as const, critical: "positive" },
    { results: [1, 1] as const, outcome: "success" as const, critical: "failure" },
    { results: [1, 1] as const, outcome: "failure" as const, critical: "failure" },
  ])("keeps DT $outcome independent from $critical critical state", ({ results, outcome, critical }) => {
    const total = results[0] + results[1];
    const snapshot: CheckSnapshotV3 = {
      schemaVersion: 3,
      ...createLegacyResult(),
      components: createLegacyResult().components.map((component, index) => ({
        ...component,
        result: results[index] as number,
      })),
      extraDice: [],
      total,
      difficulty: outcome === "success" ? total : total + 1,
      outcome,
    };

    const viewModel = buildCheckCardViewModel(snapshot);

    expect(viewModel.resolution?.outcome).toBe(outcome);
    expect(viewModel.rollAnalysis.isPositiveCritical).toBe(
      critical === "positive",
    );
    expect(viewModel.rollAnalysis.isCriticalFailure).toBe(
      critical === "failure",
    );
  });

  it("does not add presentation-only actor data to a historical snapshot", () => {
    const snapshot: CheckSnapshotV1 = {
      schemaVersion: 1,
      ...createLegacyResult(),
    };

    expect(buildCheckCardViewModel(snapshot)).not.toHaveProperty("portrait");
    expect(snapshot).not.toHaveProperty("portrait");
  });
});
