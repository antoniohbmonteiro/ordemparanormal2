import { describe, expect, it } from "vitest";

import type { CheckSnapshotV3 } from "../../application/checks/check-snapshot";
import { buildOpposedCheckCardViewModel, buildStatefulOpposedCheckCardViewModel } from "./opposed-check-card-view-model";

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

  it("uses requested context while pending and effective snapshot context after rolling", () => {
    const base = {
      participant: { kind: "actor" as const, uuid: "Actor.left" as const },
      selection: { kind: "skill" as const, key: "fighting" as const },
      presentation: { name: "Victor", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
    };
    const original = createSnapshot(5, 6, 4);
    const alternate: CheckSnapshotV3 = {
      ...original,
      components: [{ ...original.components[0]!, key: "mind", label: "Mente" }, original.components[1]!],
    };
    const viewModel = buildStatefulOpposedCheckCardViewModel({
      schemaVersion: 1,
      left: { ...base, result: alternate },
      right: { ...base, participant: { kind: "actor", uuid: "Actor.right" }, presentation: { ...base.presentation, name: "Edgar" } },
    }, "TESTE OPOSTO: LUTA", "Conflito");

    expect(viewModel.left.context).toBe("Mente + Luta");
    expect(viewModel.right.context).toBe("Físico + Luta");
    expect(viewModel.title).toBe("TESTE OPOSTO: LUTA");
    expect(viewModel.resolution).toBe("pending");
  });

  it("projects equal totals without a winner", () => {
    const side = (uuid: `Actor.${string}`, name: string) => ({
      participant: { kind: "actor" as const, uuid }, selection: { kind: "skill" as const, key: "fighting" as const },
      presentation: { name, requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" }, result: createSnapshot(5, 6, 4),
    });
    const viewModel = buildStatefulOpposedCheckCardViewModel({ schemaVersion: 1, left: side("Actor.left", "Victor"), right: side("Actor.right", "Edgar") }, "Teste", "Conflito");
    expect(viewModel.resolution).toBe("equalTotals");
    expect(viewModel).not.toHaveProperty("winner");
  });
});
