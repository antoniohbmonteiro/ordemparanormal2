import { afterEach, describe, expect, it, vi } from "vitest";

import type { CheckInput } from "../../../core/checks/check";
import { executeFoundryCheck } from "./execute-foundry-check";

const INPUT: CheckInput = {
  check: { kind: "skill", key: "perception", name: "Percepção" },
  components: [
    { kind: "attribute", key: "mind", label: "Mente", die: 8 },
    { kind: "skill", key: "perception", label: "Percepção", die: 6 },
  ],
  extraDice: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubRoll({
  total = 9,
  dice = [
    { faces: 8, results: [{ result: 5, active: true }] },
    { faces: 6, results: [{ result: 4, active: true }] },
  ],
}: {
  total?: number;
  dice?: Array<{
    faces: number;
    results: Array<{
      result: number;
      active?: boolean;
      discarded?: boolean;
    }>;
  }>;
} = {}) {
  const evaluate = vi.fn().mockResolvedValue({ total, dice });
  const create = vi.fn(() => ({ evaluate }));
  vi.stubGlobal("Roll", { create });
  return { create, evaluate };
}

describe("Foundry check Roll adapter", () => {
  it("evaluates one Roll without an interactive resolver", async () => {
    const { create, evaluate } = stubRoll();

    const execution = await executeFoundryCheck(INPUT);

    expect(create).toHaveBeenCalledWith("1d8 + 1d6");
    expect(evaluate).toHaveBeenCalledWith({ allowInteractive: false });
    expect(execution.result.total).toBe(9);
    expect(execution.result.components.map(({ result }) => result)).toEqual([
      5, 4,
    ]);
    expect(execution.result.extraDice).toEqual([]);
  });

  it("rolls four real dice while the domain keeps the three highest", async () => {
    const input: CheckInput = {
      ...INPUT,
      extraDice: [
        {
          id: "situational-1",
          die: 4,
          source: "situational",
          label: "Situacional",
        },
        {
          id: "situational-2",
          die: 8,
          source: "situational",
          label: "Situacional",
        },
      ],
    };
    const { create } = stubRoll({
      total: 19,
      dice: [
        { faces: 8, results: [{ result: 7 }] },
        { faces: 6, results: [{ result: 2 }] },
        { faces: 4, results: [{ result: 4 }] },
        { faces: 8, results: [{ result: 6 }] },
      ],
    });

    const execution = await executeFoundryCheck(input);

    expect(create).toHaveBeenCalledWith("1d8 + 1d6 + 1d4 + 1d8");
    expect(execution.result.total).toBe(17);
    expect(execution.result.extraDice.map(({ result }) => result)).toEqual([
      4, 6,
    ]);
  });

  it("rejects mismatched term faces", async () => {
    stubRoll({
      dice: [
        { faces: 6, results: [{ result: 5 }] },
        { faces: 6, results: [{ result: 4 }] },
      ],
    });

    await expect(executeFoundryCheck(INPUT)).rejects.toThrow("faces");
  });

  it("rejects more than one active result for a component", async () => {
    stubRoll({
      dice: [
        { faces: 8, results: [{ result: 5 }, { result: 3 }] },
        { faces: 6, results: [{ result: 4 }] },
      ],
    });

    await expect(executeFoundryCheck(INPUT)).rejects.toThrow("exactly one");
  });

  it("rejects a total that differs from the structured result", async () => {
    stubRoll({ total: 10 });

    await expect(executeFoundryCheck(INPUT)).rejects.toThrow("total");
  });
});
