import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishAbilityMessage } from "../../adapters/foundry/chat/publish-ability-message";
import { publishCheckMessage } from "../../adapters/foundry/chat/publish-check-message";
import { executeFoundryCheck } from "../../adapters/foundry/dice/execute-foundry-check";
import { openCheckDialog } from "../../applications/checks/check-dialog";
import { resolveCheck } from "../../core/checks/check";
import { executeAbilityForm } from "./execute-ability-form";

vi.mock("../../adapters/foundry/chat/publish-ability-message", () => ({ publishAbilityMessage: vi.fn() }));
vi.mock("../../adapters/foundry/chat/publish-check-message", () => ({ publishCheckMessage: vi.fn() }));
vi.mock("../../adapters/foundry/dice/execute-foundry-check", () => ({ executeFoundryCheck: vi.fn() }));
vi.mock("../../applications/checks/check-dialog", () => ({ openCheckDialog: vi.fn() }));

const choices = { difficulty: 13, stepAdjustments: { physical: 0, fighting: 0 } as const, extraDice: [], abilityUses: [] };

function fixture(combat: boolean) {
  const token = { id: "origin" } as foundry.documents.TokenDocument;
  const update = vi.fn(async () => actor);
  const actor = {
    token, type: "threat", isOwner: true, update,
    system: {
      resources: { health: { value: 5 } },
      attributes: { physical: 8, mind: 4, emotion: 4 },
      skills: [{ kind: "skill", key: "fighting", die: 6 }],
    },
  } as unknown as foundry.documents.Actor;
  const use = {
    id: "use", name: "Forma", description: "", minimumLevel: null, checkIntegration: null,
    cost: { source: "health", amount: 2 },
    ...(combat ? { combatAction: {
      typeLabel: "", requirements: "", check: { kind: "skill", key: "fighting", attribute: null }, damage: null,
    } } : {}),
  };
  const item = { id: "item", type: "ability", actor, system: { uses: [use] } } as unknown as foundry.documents.Item;
  return { actor, item, token, update, use };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("game", { user: { isGM: false }, i18n: { localize: (key: string) => key } });
  vi.mocked(publishCheckMessage).mockResolvedValue({});
  vi.mocked(executeFoundryCheck).mockImplementation(async (input) => ({
    roll: {} as foundry.dice.Roll,
    result: resolveCheck(input, {
      components: input.components.map(({ key, die }) => ({ key, die, result: 6 })), extraDice: [],
    }),
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("Embedded Ability execution", () => {
  it("charges an ordinary characteristic once and publishes from the synthetic token", async () => {
    const { actor, item, token, update } = fixture(false);
    await expect(executeAbilityForm(actor, item, "use")).resolves.toMatchObject({ status: "success", remaining: 3 });
    expect(update).toHaveBeenCalledExactlyOnceWith({ "system.resources.health.value": 3 });
    expect(publishAbilityMessage).toHaveBeenCalledExactlyOnceWith(actor, item, expect.objectContaining({ amount: 2 }), { token });
    expect(openCheckDialog).not.toHaveBeenCalled();
  });

  it("keeps DT independent from a critical and publishes only the Check with the origin token", async () => {
    const { actor, item, token, update } = fixture(true);
    vi.mocked(openCheckDialog).mockResolvedValue(choices);
    await expect(executeAbilityForm(actor, item, "use")).resolves.toMatchObject({ status: "success" });
    expect(publishCheckMessage).toHaveBeenCalledExactlyOnceWith(actor, expect.objectContaining({
      result: expect.objectContaining({ total: 12 }),
    }), expect.objectContaining({ outcome: "failure" }), [], undefined, token);
    expect(update).toHaveBeenCalledOnce();
    expect(publishAbilityMessage).not.toHaveBeenCalled();
  });

  it("skips payment on cancellation, a stale form, and a failed roll", async () => {
    const { actor, item, update, use } = fixture(true);
    vi.mocked(openCheckDialog).mockResolvedValueOnce(null).mockImplementationOnce(async () => {
      use.cost.amount = 3;
      return choices;
    }).mockResolvedValueOnce(choices);
    await expect(executeAbilityForm(actor, item, "use")).resolves.toEqual({ status: "cancelled" });
    await expect(executeAbilityForm(actor, item, "use")).resolves.toEqual({ status: "changed" });
    expect(executeFoundryCheck).not.toHaveBeenCalled();
    vi.mocked(executeFoundryCheck).mockRejectedValueOnce(new Error("Roll failed"));
    await expect(executeAbilityForm(actor, item, "use")).rejects.toThrow("Roll failed");
    expect(update).not.toHaveBeenCalled();
    expect(publishCheckMessage).not.toHaveBeenCalled();
  });

  it("blocks a form requiring PD and reports publication failure after payment", async () => {
    const { actor, item, update, use } = fixture(false);
    use.cost.source = "determination";
    await expect(executeAbilityForm(actor, item, "use")).resolves.toEqual({ status: "unavailable", reason: "determination" });
    expect(update).not.toHaveBeenCalled();
    use.cost.source = "health";
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.mocked(publishAbilityMessage).mockRejectedValueOnce(new Error("Chat failed"));
      await expect(executeAbilityForm(actor, item, "use")).resolves.toEqual({ status: "publication-failed" });
      expect(update).toHaveBeenCalledOnce();
    } finally {
      report.mockRestore();
    }
  });
});
