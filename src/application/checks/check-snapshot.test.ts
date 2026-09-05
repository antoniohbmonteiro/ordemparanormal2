import { describe, expect, it } from "vitest";

import type { CheckResult } from "../../core/checks/check";
import { createCheckSnapshot } from "./check-snapshot";

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

  it("creates V3 without difficulty fields when the check has no DT", () => {
    const snapshot = createCheckSnapshot(createResult());

    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot).not.toHaveProperty("difficulty");
    expect(snapshot).not.toHaveProperty("outcome");
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("creates V3 with paired difficulty and outcome fields", () => {
    const snapshot = createCheckSnapshot(createResult(), {
      difficulty: 12,
      outcome: "success",
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        schemaVersion: 3,
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
});
