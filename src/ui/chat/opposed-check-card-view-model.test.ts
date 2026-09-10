import { describe, expect, it } from "vitest";

import type { CheckSnapshotV3 } from "../../application/checks/check-snapshot";
import { buildOpposedCheckCardViewModel } from "./opposed-check-card-view-model";

function createSnapshot(
  attributeResult: number,
  skillDie: 4 | 6,
  skillResult: number,
): CheckSnapshotV3 {
  return {
    schemaVersion: 3,
    check: { kind: "skill", key: "fighting", name: "Luta" },
    components: [
      {
        kind: "attribute",
        key: "physical",
        label: "Físico",
        die: 8,
        result: attributeResult,
      },
      {
        kind: "skill",
        key: "fighting",
        label: "Luta",
        die: skillDie,
        result: skillResult,
      },
    ],
    extraDice: [],
    total: attributeResult + skillResult,
  };
}

describe("opposed check card view model", () => {
  it("projects both resolved Checks and the explicitly selected winner", () => {
    const viewModel = buildOpposedCheckCardViewModel({
      title: "TESTE OPOSTO: LUTA",
      subtitle: "Conflito entre personagens",
      left: {
        name: "Victor",
        img: "actors/victor.webp",
        check: createSnapshot(5, 6, 4),
      },
      right: {
        name: "Alan",
        img: "actors/alan.webp",
        check: createSnapshot(4, 4, 3),
      },
      winner: "left",
    });

    expect(viewModel).toMatchObject({
      title: "TESTE OPOSTO: LUTA",
      subtitle: "Conflito entre personagens",
      left: {
        name: "Victor",
        img: "actors/victor.webp",
        context: "Físico + Luta",
        total: 9,
        highestResult: 5,
        lowestResult: 4,
        contributingFormula: "d8 + d6",
      },
      right: {
        name: "Alan",
        img: "actors/alan.webp",
        context: "Físico + Luta",
        total: 7,
        highestResult: 4,
        lowestResult: 3,
        contributingFormula: "d8 + d4",
      },
      winner: { name: "Victor", total: 9 },
    });
    expect(viewModel.left.dice.map(({ result }) => result)).toEqual([5, 4]);
    expect(viewModel.right.dice.map(({ result }) => result)).toEqual([4, 3]);
  });

  it("does not infer the winner from participant totals", () => {
    const viewModel = buildOpposedCheckCardViewModel({
      title: "Teste",
      subtitle: "Conflito",
      left: { name: "Esquerda", check: createSnapshot(5, 6, 4) },
      right: { name: "Direita", check: createSnapshot(4, 4, 3) },
      winner: "right",
    });

    expect(viewModel.winner).toBe(viewModel.right);
  });
});
