import { describe, expect, it } from "vitest";

import type { CheckResult } from "../../core/checks/check";
import { createCheckSnapshot, isSupportedCheckSnapshot } from "./check-snapshot";

function createResult(): CheckResult {
  return {
    check: { kind: "skill", key: "perception", name: "Percepção" },
    components: [
      {
        kind: "attribute",
        key: "mind",
        label: "Mente",
        die: 8,
        result: 5,
      },
      {
        kind: "skill",
        key: "perception",
        label: "Percepção",
        die: 6,
        result: 4,
      },
    ],
    extraDice: [
      {
        id: "situational-1",
        die: 4,
        source: "situational",
        label: "Situacional",
        result: 3,
      },
    ],
    total: 12,
  };
}

describe("check snapshot", () => {
  it("preserves the alternate attribute actually used by a skill check", () => {
    const result: CheckResult = {
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

    expect(createCheckSnapshot(result).components).toEqual(result.components);
  });

  it("creates V4 without difficulty fields when the check has no DT", () => {
    const snapshot = createCheckSnapshot(createResult());

    expect(snapshot.schemaVersion).toBe(4);
    expect(snapshot.appliedAbilityUses).toEqual([]);
    expect(snapshot).not.toHaveProperty("difficulty");
    expect(snapshot).not.toHaveProperty("outcome");
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("creates V4 with paired difficulty and outcome fields", () => {
    const snapshot = createCheckSnapshot(createResult(), {
      difficulty: 12,
      outcome: "success",
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        schemaVersion: 4,
        difficulty: 12,
        outcome: "success",
      }),
    );
  });

  it("does not retain mutable references to the resolved result", () => {
    const result = createResult();
    const snapshot = createCheckSnapshot(result);

    (result.check as { name: string }).name = "Nome alterado";
    (result.components[0] as { label: string }).label = "Alterado";
    (result.extraDice[0] as { label: string }).label = "Alterado";

    expect(snapshot.check.name).toBe("Percepção");
    expect(snapshot.components[0]?.label).toBe("Mente");
    expect(snapshot.extraDice[0]?.label).toBe("Situacional");
  });

  it("validates V4 die results, provenance, IDs, and recalculated totals", () => {
    const valid = createCheckSnapshot(createResult());

    expect(isSupportedCheckSnapshot(valid)).toBe(true);
    expect(
      isSupportedCheckSnapshot({
        ...valid,
        components: [{ ...valid.components[0], result: 9 }, valid.components[1]],
      }),
    ).toBe(false);
    expect(
      isSupportedCheckSnapshot({
        ...valid,
        extraDice: [{ ...valid.extraDice[0], source: "forged" }],
      }),
    ).toBe(false);
    expect(
      isSupportedCheckSnapshot({
        ...valid,
        extraDice: [valid.extraDice[0], { ...valid.extraDice[0] }],
        total: 15,
      }),
    ).toBe(false);
    expect(isSupportedCheckSnapshot({ ...valid, total: valid.total + 1 })).toBe(false);
  });

  it("validates one-to-one Ability provenance while continuing to read V3", () => {
    const result = createResult();
    const abilityResult: CheckResult = {
      ...result,
      extraDice: [{ id: "ability:focus:d4", die: 4, source: "ability", label: "Foco — Adicionar d4", result: 3 }],
    };
    const applied = [{
      abilityId: "focus", abilityName: "Foco", useId: "d4", useName: "Adicionar d4",
      extraDieId: "ability:focus:d4", die: 4 as const,
      cost: { source: "determination" as const, amount: 2 },
    }];
    const snapshot = createCheckSnapshot(abilityResult, undefined, applied);
    expect(isSupportedCheckSnapshot(snapshot)).toBe(true);
    expect(isSupportedCheckSnapshot({ ...snapshot, appliedAbilityUses: [] })).toBe(false);
    expect(isSupportedCheckSnapshot({ ...snapshot, appliedAbilityUses: [{ ...applied[0], extraDieId: "forged" }] })).toBe(false);

    const v3 = { ...createCheckSnapshot(result), schemaVersion: 3 as const };
    const { appliedAbilityUses: _discarded, ...legacy } = v3;
    expect(isSupportedCheckSnapshot(legacy)).toBe(true);
  });

  it("validates the four-die cap, three-highest total, and paired DT fields", () => {
    const fourDice = createCheckSnapshot({
      ...createResult(),
      extraDice: [
        ...createResult().extraDice,
        { id: "situational-2", die: 6, source: "situational", label: "Ajuda", result: 1 },
      ],
      total: 12,
    });

    expect(isSupportedCheckSnapshot(fourDice)).toBe(true);
    expect(
      isSupportedCheckSnapshot({
        ...fourDice,
        extraDice: [
          ...fourDice.extraDice,
          { id: "situational-3", die: 4, source: "situational", label: "Bônus", result: 2 },
        ],
      }),
    ).toBe(false);
    expect(isSupportedCheckSnapshot({ ...fourDice, difficulty: 10 })).toBe(false);
    expect(isSupportedCheckSnapshot({ ...fourDice, outcome: "success" })).toBe(false);
    expect(
      isSupportedCheckSnapshot({ ...fourDice, difficulty: 0, outcome: "success" }),
    ).toBe(false);
    expect(
      isSupportedCheckSnapshot({ ...fourDice, difficulty: 10, outcome: "success" }),
    ).toBe(true);
  });
});
