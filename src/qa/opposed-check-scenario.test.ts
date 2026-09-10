import { afterEach, describe, expect, it, vi } from "vitest";

import { publishOpposedCheckMessage } from "../adapters/foundry/chat/publish-opposed-check-message";
import { analyzeCheckRoll } from "../core/checks/check-roll-analysis";
import { publishOpposedCheckScenario } from "./opposed-check-scenario";

vi.mock("../adapters/foundry/chat/publish-opposed-check-message", () => ({
  publishOpposedCheckMessage: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(publishOpposedCheckMessage).mockReset();
});

describe("opposed Check QA scenario", () => {
  it("builds two valid deterministic Checks and publishes the left winner", async () => {
    const leftActor = { id: "left" } as unknown as foundry.documents.Actor;
    const rightActor = { id: "right" } as unknown as foundry.documents.Actor;
    vi.stubGlobal("game", {
      i18n: {
        format: vi.fn(() => "TESTE OPOSTO: LUTA"),
        localize: vi.fn(() => "Conflito entre personagens"),
      },
    });
    vi.mocked(publishOpposedCheckMessage).mockResolvedValue(undefined);

    await publishOpposedCheckScenario(leftActor, rightActor);

    expect(publishOpposedCheckMessage).toHaveBeenCalledOnce();
    const input = vi.mocked(publishOpposedCheckMessage).mock.calls[0]?.[0];
    expect(input).toMatchObject({
      title: "TESTE OPOSTO: LUTA",
      subtitle: "Conflito entre personagens",
      left: { actor: leftActor, check: { total: 9 } },
      right: { actor: rightActor, check: { total: 7 } },
      winner: "left",
    });
    expect(input?.left.check.components.map(({ die, result }) => ({ die, result }))).toEqual([
      { die: 8, result: 5 },
      { die: 6, result: 4 },
    ]);
    expect(input?.right.check.components.map(({ die, result }) => ({ die, result }))).toEqual([
      { die: 8, result: 4 },
      { die: 4, result: 3 },
    ]);
    expect(
      analyzeCheckRoll(input?.left.check.components.map(({ result }) => result) ?? []),
    ).toMatchObject({ highestResult: 5, lowestResult: 4 });
    expect(
      analyzeCheckRoll(input?.right.check.components.map(({ result }) => result) ?? []),
    ).toMatchObject({ highestResult: 4, lowestResult: 3 });
  });
});
