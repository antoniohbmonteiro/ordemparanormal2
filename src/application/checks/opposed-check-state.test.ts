import { describe, expect, it } from "vitest";
import type { CheckSnapshotV3 } from "./check-snapshot";
import {
  doesSnapshotMatchSelection,
  parseOpposedCheckState,
  resolveOpposedCheck,
  type OpposedCheckStateV1,
} from "./opposed-check-state";

function snapshot(
  total: number,
  attribute: "physical" | "mind" = "physical",
): CheckSnapshotV3 {
  const attributeResult = Math.min(total - 1, 8);
  const skillResult = total - attributeResult;
  return {
    schemaVersion: 3,
    check: { kind: "skill", key: "fighting", name: "Luta" },
    components: [
      {
        kind: "attribute",
        key: attribute,
        label: attribute === "mind" ? "Mente" : "Físico",
        die: 8,
        result: attributeResult,
      },
      { kind: "skill", key: "fighting", label: "Luta", die: 12, result: skillResult },
    ],
    extraDice: [],
    total,
  };
}

function state(left?: CheckSnapshotV3, right?: CheckSnapshotV3): OpposedCheckStateV1 {
  const side = (uuid: `Actor.${string}`, name: string) => ({
    participant: { kind: "actor" as const, uuid },
    selection: { kind: "skill" as const, key: "fighting" as const },
    presentation: {
      name,
      requestedCheckLabel: "Luta",
      requestedCheckContext: "Físico + Luta",
    },
  });
  return {
    schemaVersion: 1,
    left: { ...side("Actor.left", "Victor"), ...(left ? { result: left } : {}) },
    right: { ...side("Actor.right", "Edgar"), ...(right ? { result: right } : {}) },
  };
}

describe("Opposed Check state", () => {
  it("parses a valid serializable state and rejects duplicate participants", () => {
    expect(parseOpposedCheckState(state())).toEqual(state());
    const invalid = state();
    expect(
      parseOpposedCheckState({
        ...invalid,
        right: { ...invalid.right, participant: invalid.left.participant },
      }),
    ).toBeNull();
  });

  it("accepts an alternate attribute while preserving the requested skill", () => {
    expect(
      doesSnapshotMatchSelection(snapshot(9, "mind"), {
        kind: "skill",
        key: "fighting",
      }),
    ).toBe(true);
    expect(
      doesSnapshotMatchSelection(snapshot(9), {
        kind: "skill",
        key: "perception",
      }),
    ).toBe(false);
  });

  it("rejects opposed snapshots with DT or an inconsistent total", () => {
    const withDifficulty = { ...snapshot(9), difficulty: 9, outcome: "success" as const };
    expect(parseOpposedCheckState(state(withDifficulty))).toBeNull();
    expect(parseOpposedCheckState(state({ ...snapshot(9), total: 10 }))).toBeNull();
  });

  it("derives pending, each winner, and neutral equalTotals", () => {
    expect(resolveOpposedCheck(state())).toEqual({ status: "pending" });
    expect(resolveOpposedCheck(state(snapshot(9), snapshot(7)))).toEqual({
      status: "leftWon",
      winner: "left",
    });
    expect(resolveOpposedCheck(state(snapshot(7), snapshot(9)))).toEqual({
      status: "rightWon",
      winner: "right",
    });
    expect(resolveOpposedCheck(state(snapshot(9), snapshot(9, "mind")))).toEqual({
      status: "equalTotals",
    });
  });

  it("does not use RA, RB, or critical state to break equal totals", () => {
    const left = snapshot(9);
    const right: CheckSnapshotV3 = {
      ...snapshot(9),
      components: [
        { kind: "attribute", key: "physical", label: "Físico", die: 12, result: 6 },
        { kind: "skill", key: "fighting", label: "Luta", die: 4, result: 3 },
      ],
    };
    expect(resolveOpposedCheck(state(left, right))).toEqual({ status: "equalTotals" });
  });
});
