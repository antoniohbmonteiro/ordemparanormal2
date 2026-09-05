import { describe, expect, it } from "vitest";

import {
  applyCheckExtraDice,
  applyCheckStepAdjustments,
  calculateCheckTotal,
  composeAttributeCheck,
  composeSkillCheck,
  getContributingResultIndexes,
  resolveCheck,
  resolveCheckDifficulty,
  type CheckComponentOutcome,
  type CheckExtraDieInput,
  type CheckInput,
} from "./check";

const MIND = {
  kind: "attribute",
  key: "mind",
  label: "Mente",
  die: 8,
} as const;

const PERCEPTION = {
  kind: "skill",
  key: "perception",
  label: "Percepção",
  die: 6,
} as const;

describe("check composition and resolution", () => {
  it("composes and resolves an attribute check", () => {
    const input = composeAttributeCheck(MIND);

    expect(
      resolveCheck(input, {
        components: [{ key: "mind", die: 8, result: 5 }],
        extraDice: [],
      }),
    ).toEqual({
      check: { kind: "attribute", key: "mind", name: "Mente" },
      components: [{ ...MIND, result: 5 }],
      extraDice: [],
      total: 5,
    });
  });

  it("composes and resolves a skill check in component order", () => {
    const input = composeSkillCheck(
      { kind: "skill", key: "perception", name: "Percepção" },
      MIND,
      PERCEPTION,
    );

    expect(
      resolveCheck(input, {
        components: [
          { key: "mind", die: 8, result: 5 },
          { key: "perception", die: 6, result: 4 },
        ],
        extraDice: [],
      }),
    ).toEqual({
      check: { kind: "skill", key: "perception", name: "Percepção" },
      components: [
        { ...MIND, result: 5 },
        { ...PERCEPTION, result: 4 },
      ],
      extraDice: [],
      total: 9,
    });
  });

  it.each([
    {
      name: "outcome count",
      outcomes: [{ key: "mind", die: 8, result: 5 }],
    },
    {
      name: "outcome order",
      outcomes: [
        { key: "perception", die: 8, result: 5 },
        { key: "mind", die: 6, result: 4 },
      ],
    },
    {
      name: "die mismatch",
      outcomes: [
        { key: "mind", die: 6, result: 5 },
        { key: "perception", die: 6, result: 4 },
      ],
    },
    {
      name: "result below range",
      outcomes: [
        { key: "mind", die: 8, result: 0 },
        { key: "perception", die: 6, result: 4 },
      ],
    },
    {
      name: "result above range",
      outcomes: [
        { key: "mind", die: 8, result: 9 },
        { key: "perception", die: 6, result: 4 },
      ],
    },
  ] satisfies readonly {
    name: string;
    outcomes: readonly CheckComponentOutcome[];
  }[])("rejects invalid $name", ({ outcomes }) => {
    const input = composeSkillCheck(
      { kind: "skill", key: "perception", name: "Percepção" },
      MIND,
      PERCEPTION,
    );

    expect(() =>
      resolveCheck(input, { components: outcomes, extraDice: [] }),
    ).toThrow();
  });

  it("rejects checks without components", () => {
    const input: CheckInput = {
      check: { kind: "attribute", key: "mind", name: "Mente" },
      components: [],
      extraDice: [],
    };

    expect(() =>
      resolveCheck(input, { components: [], extraDice: [] }),
    ).toThrow(
      "A check must contain at least one component.",
    );
  });
});

describe("check step adjustments", () => {
  it("adjusts components independently without mutating the base input", () => {
    const input = composeSkillCheck(
      { kind: "skill", key: "perception", name: "Percepção" },
      MIND,
      PERCEPTION,
    );

    const adjusted = applyCheckStepAdjustments(input, {
      mind: 0,
      perception: 1,
    });

    expect(adjusted).toEqual({
      check: input.check,
      components: [
        MIND,
        { ...PERCEPTION, die: 8 },
      ],
      extraDice: [],
    });
    expect(input.components).toEqual([MIND, PERCEPTION]);
    expect(adjusted).not.toBe(input);
    expect(adjusted.components[0]).not.toBe(input.components[0]);
  });

  it("preserves d20 while adjusting the other components", () => {
    const input = composeSkillCheck(
      { kind: "skill", key: "perception", name: "Percepção" },
      { ...MIND, die: 20 },
      PERCEPTION,
    );

    expect(
      applyCheckStepAdjustments(input, { mind: -4, perception: 1 }).components,
    ).toEqual([
      { ...MIND, die: 20 },
      { ...PERCEPTION, die: 8 },
    ]);
  });

  it("applies multi-step clamping to all components", () => {
    const input = composeSkillCheck(
      { kind: "skill", key: "perception", name: "Percepção" },
      { ...MIND, die: 12 },
      { ...PERCEPTION, die: 4 },
    );

    expect(
      applyCheckStepAdjustments(input, { mind: 2, perception: -2 }).components,
    ).toEqual([
      { ...MIND, die: 12 },
      { ...PERCEPTION, die: 4 },
    ]);
  });

  it("rejects adjustments that do not match the component keys", () => {
    const input = composeSkillCheck(
      { kind: "skill", key: "perception", name: "Percepção" },
      MIND,
      PERCEPTION,
    );

    expect(() => applyCheckStepAdjustments(input, { mind: 0 })).toThrow(
      "match its components",
    );
    expect(() =>
      applyCheckStepAdjustments(input, {
        mind: 0,
        perception: 0,
        unknown: 0,
      }),
    ).toThrow("match its components");
  });
});

describe("check extra dice", () => {
  const SITUATIONAL_D4 = {
    id: "situational-1",
    die: 4,
    source: "situational",
    label: "Situacional",
  } as const;

  it("attaches repeated extra dice without mutating the base input", () => {
    const input = composeSkillCheck(
      { kind: "skill", key: "perception", name: "Percepção" },
      MIND,
      PERCEPTION,
    );
    const extraDice = [
      SITUATIONAL_D4,
      { ...SITUATIONAL_D4, id: "situational-2" },
    ] as const;

    const effectiveInput = applyCheckExtraDice(input, extraDice);

    expect(effectiveInput.extraDice).toEqual(extraDice);
    expect(effectiveInput.extraDice).not.toBe(extraDice);
    expect(input.extraDice).toEqual([]);
  });

  it("rejects more than four total dice", () => {
    const input = composeSkillCheck(
      { kind: "skill", key: "perception", name: "Percepção" },
      MIND,
      PERCEPTION,
    );

    expect(() =>
      applyCheckExtraDice(input, [
        SITUATIONAL_D4,
        { ...SITUATIONAL_D4, id: "situational-2" },
        { ...SITUATIONAL_D4, id: "situational-3" },
      ]),
    ).toThrow("more than 4");
  });

  it("rejects duplicate extra die IDs", () => {
    const input = composeAttributeCheck(MIND);

    expect(() =>
      applyCheckExtraDice(input, [SITUATIONAL_D4, SITUATIONAL_D4]),
    ).toThrow("unique");
  });

  it("rejects situational d20 at the domain boundary", () => {
    const input = composeAttributeCheck(MIND);
    const invalidExtraDie = {
      ...SITUATIONAL_D4,
      die: 20,
    } as unknown as CheckExtraDieInput;

    expect(() => applyCheckExtraDice(input, [invalidExtraDie])).toThrow(
      "normal die step",
    );
  });

  it("resolves extra dice and keeps the three highest of four results", () => {
    const input = applyCheckExtraDice(
      composeSkillCheck(
        { kind: "skill", key: "perception", name: "Percepção" },
        MIND,
        PERCEPTION,
      ),
      [SITUATIONAL_D4, { ...SITUATIONAL_D4, id: "situational-2", die: 8 }],
    );

    const result = resolveCheck(input, {
      components: [
        { key: "mind", die: 8, result: 7 },
        { key: "perception", die: 6, result: 2 },
      ],
      extraDice: [
        { id: "situational-1", die: 4, result: 4 },
        { id: "situational-2", die: 8, result: 6 },
      ],
    });

    expect(result.extraDice).toEqual([
      { ...SITUATIONAL_D4, result: 4 },
      { ...SITUATIONAL_D4, id: "situational-2", die: 8, result: 6 },
    ]);
    expect(result.total).toBe(17);
  });

  it("drops the lowest result when it belongs to an extra die", () => {
    const input = applyCheckExtraDice(
      composeSkillCheck(
        { kind: "skill", key: "perception", name: "Percepção" },
        MIND,
        PERCEPTION,
      ),
      [SITUATIONAL_D4, { ...SITUATIONAL_D4, id: "situational-2", die: 8 }],
    );

    const result = resolveCheck(input, {
      components: [
        { key: "mind", die: 8, result: 7 },
        { key: "perception", die: 6, result: 6 },
      ],
      extraDice: [
        { id: "situational-1", die: 4, result: 2 },
        { id: "situational-2", die: 8, result: 4 },
      ],
    });

    expect(result.total).toBe(17);
  });

  it.each([
    [[7], [0]],
    [[7, 6], [0, 1]],
    [[7, 6, 4], [0, 1, 2]],
  ] as const)("marks every result in %j as contributing", (results, expected) => {
    expect(getContributingResultIndexes(results)).toEqual(expected);
  });

  it("selects the three highest results while returning original roll order", () => {
    expect(getContributingResultIndexes([2, 8, 4, 6])).toEqual([1, 2, 3]);
  });

  it("uses original roll order to break a tie at the cutoff", () => {
    expect(getContributingResultIndexes([6, 4, 4, 4])).toEqual([0, 1, 2]);
  });

  it.each([
    [[7], 7],
    [[7, 6], 13],
    [[7, 6, 4], 17],
    [[2, 8, 4, 6], 18],
    [[6, 4, 4, 4], 14],
  ] as const)("calculates total %j from the shared selection", (results, expected) => {
    expect(calculateCheckTotal(results)).toBe(expected);
  });
});

describe("check difficulty resolution", () => {
  it("resolves equality as success", () => {
    expect(resolveCheckDifficulty(9, 9)).toEqual({
      difficulty: 9,
      outcome: "success",
    });
  });

  it("resolves a total below the difficulty as failure", () => {
    expect(resolveCheckDifficulty(8, 9)).toEqual({
      difficulty: 9,
      outcome: "failure",
    });
  });
});
