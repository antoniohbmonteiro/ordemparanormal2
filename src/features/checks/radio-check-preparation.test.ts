import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILL_DEFINITIONS } from "../../config/skills";
import { prepareAgentCheckExecution, isAgentCheckChoices } from "./resolve-agent-check-interaction";
import { executeFoundryCheck } from "../../adapters/foundry/dice/execute-foundry-check";
import { radioRemovalCount } from "../../core/equipment/radio-puzzle";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const requester = { id: "owner", isGM: false } as foundry.documents.User;
  const use = { id: "extra", name: "Dado extra", description: "", minimumLevel: null,
    cost: { source: "determination", amount: 2 },
    checkIntegration: { modification: { type: "extraDie", applicability: { type: "any" }, die: 4 } } };
  const actor = { type: "agent", items: [{ id: "ability", type: "ability", name: "Habilidade", sort: 0,
    system: { uses: [use], resource: null } }], testUserPermission: vi.fn(() => true), update: vi.fn(),
    system: { level: 2, attributes: { physical: 4, mind: 6, emotion: 8 },
      resources: { health: { value: 10 }, determination: { value: 5 } },
      skills: Object.fromEntries(SKILL_DEFINITIONS.map(skill => [skill.key, "specializations" in skill
        ? Object.fromEntries(skill.specializations.map(specialization => [specialization.key, 6])) : 6])) } };
  vi.stubGlobal("game", { user: { id: "gm", isGM: true }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  const choices = { selectedAttribute: "emotion" as const, stepAdjustments: { emotion: -1, technology: 0 },
    extraDice: [{ id: "situational", label: "Circunstância", source: "situational" as const, die: 4 as const }],
    abilityUses: [{ abilityId: "ability", useId: "extra" }] };
  return { actor, requester, choices, use };
}
describe("Radio normal Technology Check preparation", () => {
  it("rebuilds current Actor dice and Ability references without payment, using the normal four-dice total", async () => {
    const f = fixture();
    const prepared = prepareAgentCheckExecution(f.actor as unknown as foundry.documents.Actor,
      { kind: "skill", key: "technology" }, f.choices, f.requester);
    expect(prepared.effectiveInput.components.map(component => [component.key, component.die]))
      .toEqual([["emotion", 6], ["technology", 6]]);
    expect(prepared.effectiveInput.extraDice).toEqual([f.choices.extraDice[0],
      { id: "ability:ability:extra", label: "Habilidade — Dado extra", source: "ability", die: 4 }]);
    expect(f.actor.update).not.toHaveBeenCalled();
    const evaluate = vi.fn(async () => ({ total: 14, dice: [6, 6, 4, 4].map((faces, index) =>
      ({ faces, results: [{ result: [2, 4, 4, 4][index], active: true }] })) }));
    const create = vi.fn(() => ({ evaluate })); vi.stubGlobal("Roll", { create });
    const execution = await executeFoundryCheck(prepared.effectiveInput);
    expect(create).toHaveBeenCalledWith("1d6 + 1d6 + 1d4 + 1d4");
    expect(evaluate).toHaveBeenCalledWith({ allowInteractive: false });
    expect(execution.result.total).toBe(12);
    expect(radioRemovalCount(execution.result.total, 5)).toBe(3);
    f.actor.system.attributes.emotion = 12;
    expect(prepareAgentCheckExecution(f.actor as unknown as foundry.documents.Actor,
      { kind: "skill", key: "technology" }, f.choices, f.requester).effectiveInput.components[0].die).toBe(10);
    expect(prepared.effectiveInput.components[0].die).toBe(6);
  });
  it("rejects forged outcome/base dice, Ability dice and stale references before execution", () => {
    const f = fixture();
    expect(isAgentCheckChoices(f.choices)).toBe(true);
    for (const key of ["total", "result", "components", "snapshot"]) expect(isAgentCheckChoices({ ...f.choices, [key]: 20 })).toBe(false);
    expect(isAgentCheckChoices({ ...f.choices, extraDice: [{ ...f.choices.extraDice[0], source: "ability" }] })).toBe(false);
    const actor = f.actor as unknown as foundry.documents.Actor;
    expect(() => prepareAgentCheckExecution(actor, { kind: "skill", key: "technology" },
      { ...f.choices, abilityUses: [{ abilityId: "missing", useId: "extra" }] }, f.requester)).toThrow();
    expect(() => prepareAgentCheckExecution(actor, { kind: "skill", key: "technology" },
      { ...f.choices, stepAdjustments: { mind: 0, technology: 0 } }, f.requester)).toThrow();
    f.actor.testUserPermission.mockReturnValue(false);
    expect(() => prepareAgentCheckExecution(actor, { kind: "skill", key: "technology" }, f.choices, f.requester)).toThrow();
    expect(f.actor.update).not.toHaveBeenCalled();
  });
});
