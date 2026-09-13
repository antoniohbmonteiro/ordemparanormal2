import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildChoices: vi.fn(),
  buildCheck: vi.fn(),
  canRoll: vi.fn(),
  execute: vi.fn(),
  openDialog: vi.fn(),
  readSource: vi.fn(),
  readAbilities: vi.fn(),
  prepareAbilityUses: vi.fn(),
  confirmAbilityUses: vi.fn(),
}));

vi.mock("../../application/checks/build-agent-check", () => ({
  buildAgentAttributeChoices: mocks.buildChoices,
  buildAgentCheck: mocks.buildCheck,
}));
vi.mock("../../applications/checks/check-dialog", () => ({ openCheckDialog: mocks.openDialog }));
vi.mock("../../adapters/foundry/actors/agent-check-permission", () => ({ canUserRollActor: mocks.canRoll }));
vi.mock("../../adapters/foundry/actors/read-agent-check-source", () => ({ readAgentCheckSource: mocks.readSource }));
vi.mock("../../adapters/foundry/dice/execute-foundry-check", () => ({ executeFoundryCheck: mocks.execute }));
vi.mock("../../adapters/foundry/abilities/read-agent-check-abilities", () => ({ readAgentCheckAbilities: mocks.readAbilities }));
vi.mock("./check-ability-uses", () => ({ prepareCheckAbilityUses: mocks.prepareAbilityUses, confirmCheckAbilityUses: mocks.confirmAbilityUses }));

import { resolveAgentCheckInteraction } from "./resolve-agent-check-interaction";

describe("resolve Agent Check interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("game", { user: {}, i18n: { localize: (key: string) => key } });
    mocks.canRoll.mockReturnValue(true);
    mocks.readSource.mockReturnValue({});
    mocks.readAbilities.mockReturnValue({ level: 1, health: 0, determination: 0, abilities: [] });
    mocks.prepareAbilityUses.mockReturnValue({ references: [], applied: [], extraDice: [] });
    mocks.confirmAbilityUses.mockResolvedValue([]);
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
    mocks.openDialog.mockResolvedValue({ selectedAttribute: "mind", stepAdjustments: { mind: 0, fighting: 0 }, extraDice: [], abilityUses: [] });
    const execution = { result: { total: 9 }, roll: {} };
    mocks.execute.mockResolvedValue(execution);

    await expect(resolveAgentCheckInteraction(
      {} as foundry.documents.Actor,
      { kind: "skill", key: "fighting" },
      { allowDifficulty: false },
    )).resolves.toEqual({ execution, appliedAbilityUses: [] });
    expect(mocks.openDialog).toHaveBeenCalledWith(base, {
      allowDifficulty: false,
      attributeChoices: [{ key: "mind", label: "Mente", die: 8 }],
    });
    expect(mocks.execute).toHaveBeenCalledWith(alternate);
    expect(mocks.canRoll).toHaveBeenCalledTimes(2);
  });

  it("evaluates with authoritative Ability dice before confirming their cost", async () => {
    const base = {
      check: { kind: "attribute", key: "mind", name: "Mente" },
      components: [{ kind: "attribute", key: "mind", label: "Mente", die: 8 }],
      extraDice: [],
    };
    const abilitySource = { level: 2, health: 10, determination: 5, abilities: [{
      id: "focus", name: "Foco", resource: null, uses: [{
        id: "d4", name: "Adicionar d4", description: "", minimumLevel: null,
        cost: { source: "determination", amount: 2 },
        checkIntegration: { modification: { type: "extraDie", applicability: { type: "any" }, die: 4 } },
      }],
    }] };
    const reference = { abilityId: "focus", useId: "d4" };
    const abilityDie = { id: "ability:focus:d4", die: 4 as const, source: "ability" as const, label: "Foco — Adicionar d4" };
    const applied = [{ ...reference, abilityName: "Foco", useName: "Adicionar d4", extraDieId: abilityDie.id, die: 4 as const, cost: { source: "determination" as const, amount: 2 } }];
    mocks.readAbilities.mockReturnValue(abilitySource);
    mocks.buildCheck.mockReturnValue(base);
    mocks.openDialog.mockResolvedValue({ stepAdjustments: { mind: 0 }, extraDice: [], abilityUses: [reference] });
    mocks.prepareAbilityUses.mockReturnValue({ references: [reference], applied, extraDice: [abilityDie] });
    mocks.confirmAbilityUses.mockResolvedValue(applied);
    const execution = { result: { total: 10 }, roll: {} };
    mocks.execute.mockResolvedValue(execution);

    await expect(resolveAgentCheckInteraction(
      {} as foundry.documents.Actor,
      { kind: "attribute", key: "mind" },
    )).resolves.toEqual({ execution, appliedAbilityUses: applied });
    expect(mocks.openDialog).toHaveBeenCalledWith(base, { abilitySource });
    expect(mocks.execute).toHaveBeenCalledWith({ ...base, extraDice: [abilityDie] });
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.confirmAbilityUses.mock.invocationCallOrder[0]!);
  });
});
