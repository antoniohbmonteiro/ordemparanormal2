import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildChoices: vi.fn(),
  buildCheck: vi.fn(),
  canRoll: vi.fn(),
  execute: vi.fn(),
  openDialog: vi.fn(),
  readSource: vi.fn(),
}));

vi.mock("../../application/checks/build-agent-check", () => ({
  buildAgentAttributeChoices: mocks.buildChoices,
  buildAgentCheck: mocks.buildCheck,
}));
vi.mock("../../applications/checks/check-dialog", () => ({ openCheckDialog: mocks.openDialog }));
vi.mock("../../adapters/foundry/actors/agent-check-permission", () => ({ canUserRollActor: mocks.canRoll }));
vi.mock("../../adapters/foundry/actors/read-agent-check-source", () => ({ readAgentCheckSource: mocks.readSource }));
vi.mock("../../adapters/foundry/dice/execute-foundry-check", () => ({ executeFoundryCheck: mocks.execute }));

import { resolveAgentCheckInteraction } from "./resolve-agent-check-interaction";

describe("resolve Agent Check interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("game", { user: {}, i18n: { localize: (key: string) => key } });
    mocks.canRoll.mockReturnValue(true);
    mocks.readSource.mockReturnValue({});
    mocks.buildChoices.mockReturnValue([{ key: "mind", label: "Mente", die: 8 }]);
  });

  it("executes an alternate-attribute opposed roll without publishing or resolving DT", async () => {
    const base = {
      check: { kind: "skill", key: "fighting", name: "Luta" },
      components: [
        { kind: "attribute", key: "physical", label: "Físico", die: 8 },
        { kind: "skill", key: "fighting", label: "Luta", die: 6 },
      ],
      extraDice: [],
    };
    const alternate = { ...base, components: [{ ...base.components[0], key: "mind", label: "Mente" }, base.components[1]] };
    mocks.buildCheck.mockReturnValueOnce(base).mockReturnValueOnce(alternate);
    mocks.openDialog.mockResolvedValue({ selectedAttribute: "mind", stepAdjustments: { mind: 0, fighting: 0 }, extraDice: [] });
    const execution = { result: { total: 9 }, roll: {} };
    mocks.execute.mockResolvedValue(execution);

    await expect(resolveAgentCheckInteraction(
      {} as foundry.documents.Actor,
      { kind: "skill", key: "fighting" },
      { allowDifficulty: false },
    )).resolves.toEqual({ execution });
    expect(mocks.openDialog).toHaveBeenCalledWith(base, {
      allowDifficulty: false,
      attributeChoices: [{ key: "mind", label: "Mente", die: 8 }],
    });
    expect(mocks.execute).toHaveBeenCalledWith(alternate);
    expect(mocks.canRoll).toHaveBeenCalledTimes(2);
  });
});
