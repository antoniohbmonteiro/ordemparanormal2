import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckInput } from "../../core/checks/check";
import { CheckAbilityUseValidationError, confirmCheckAbilityUses, prepareCheckAbilityUses } from "./check-ability-uses";

const check: CheckInput = {
  check: { kind: "attribute", key: "mind", name: "Mente" },
  components: [{ kind: "attribute", key: "mind", label: "Mente", die: 8 }],
  extraDice: [],
};

function fixture() {
  const use = {
    id: "d4", name: "Adicionar d4", description: "", minimumLevel: null,
    cost: { source: "determination", amount: 2 },
    checkIntegration: { modification: { type: "extraDie", applicability: { type: "attribute", attribute: "mind" }, die: 4 } },
  };
  const ability = { id: "focus", type: "ability", name: "Foco Mental", sort: 0, system: { uses: [use], resource: null } };
  const system = { level: 2, resources: { health: { value: 10 }, determination: { value: 5 } } };
  const actorUpdate = vi.fn(async (update: Record<string, number>) => {
    if (update["system.resources.determination.value"] !== undefined) system.resources.determination.value = update["system.resources.determination.value"];
  });
  const actor = {
    type: "agent", system, items: [ability], update: actorUpdate,
    updateEmbeddedDocuments: vi.fn(), testUserPermission: vi.fn(() => true),
  } as unknown as foundry.documents.Actor;
  return { actor, ability, use, system, actorUpdate };
}

beforeEach(() => {
  vi.stubGlobal("game", { user: { isGM: false } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
});

describe("check Ability use execution", () => {
  it("prepares without writes, then revalidates and pays once", async () => {
    const { actor, actorUpdate, system } = fixture();
    const prepared = prepareCheckAbilityUses(actor, check, [], [{ abilityId: "focus", useId: "d4" }]);
    expect(prepared.extraDice).toEqual([{ id: "ability:focus:d4", die: 4, source: "ability", label: "Foco Mental — Adicionar d4" }]);
    expect(actorUpdate).not.toHaveBeenCalled();
    await expect(confirmCheckAbilityUses(actor, check, [], prepared)).resolves.toHaveLength(1);
    expect(actorUpdate).toHaveBeenCalledExactlyOnceWith({ "system.resources.determination.value": 3 });
    expect(system.resources.determination.value).toBe(3);
  });

  it("does not pay when the selected use changes after preparation", async () => {
    const { actor, ability, actorUpdate } = fixture();
    const prepared = prepareCheckAbilityUses(actor, check, [], [{ abilityId: "focus", useId: "d4" }]);
    (ability.system.uses[0] as { cost: object }).cost = { source: "determination", amount: 3 };
    await expect(confirmCheckAbilityUses(actor, check, [], prepared)).rejects.toBeInstanceOf(CheckAbilityUseValidationError);
    expect(actorUpdate).not.toHaveBeenCalled();
  });
});
