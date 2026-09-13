import { describe, expect, it } from "vitest";
import type { AbilityUseData } from "../../core/abilities/ability-use";
import type { CheckInput } from "../../core/checks/check";
import { resolveCheckAbilityUseState, toggleCheckAbilityUse, type AgentCheckAbilitySource } from "./check-ability-use-state";

function use(id: string, applicability: NonNullable<AbilityUseData["checkIntegration"]>["modification"]["applicability"], amount = 0): AbilityUseData {
  return {
    id, name: id, description: "", minimumLevel: null,
    cost: amount ? { source: "determination", amount } : { source: "none", amount: 0 },
    checkIntegration: { modification: { type: "extraDie", applicability, die: 4 } },
  };
}

const skillCheck: CheckInput = {
  check: { kind: "skill", key: "fighting", name: "Luta" },
  components: [
    { kind: "attribute", key: "physical", label: "Físico", die: 8 },
    { kind: "skill", key: "fighting", label: "Luta", die: 6 },
  ],
  extraDice: [],
};

function source(): AgentCheckAbilitySource {
  return {
    level: 5, health: 10, determination: 5,
    abilities: [
      { id: "focus", name: "Foco", resource: null, uses: [use("physical", { type: "attribute", attribute: "physical" }, 2), use("mind", { type: "attribute", attribute: "mind" }, 4)] },
      { id: "universal", name: "Universal", resource: null, uses: [use("any", { type: "any" }, 3)] },
      { id: "skill", name: "Perícia", resource: null, uses: [use("fighting", { type: "skill", skill: "fighting" })] },
    ],
  };
}

describe("check Ability use state", () => {
  it("filters by effective attribute and Skill while retaining universal uses", () => {
    const state = resolveCheckAbilityUseState({ check: skillCheck, source: source(), situationalDice: [], selected: [] });
    expect(state.options.map(({ useId }) => useId)).toEqual(["physical", "any", "fighting"]);
  });

  it("replaces a use from the same Ability and removes it after an attribute change", () => {
    const initial = resolveCheckAbilityUseState({ check: skillCheck, source: source(), situationalDice: [], selected: [{ abilityId: "focus", useId: "physical" }] });
    const mindCheck = { ...skillCheck, components: [{ ...skillCheck.components[0]!, key: "mind" }, skillCheck.components[1]!] };
    const changed = resolveCheckAbilityUseState({ check: mindCheck, source: source(), situationalDice: [], selected: initial.selected });
    expect(changed.selected).toEqual([]);
    expect(changed.applied).toEqual([]);
    expect(changed.extraDice).toEqual([]);
    expect(changed.costPlan.determination).toBeNull();
    expect(changed.totalDice).toBe(skillCheck.components.length);
    const selectedMind = toggleCheckAbilityUse({ check: mindCheck, source: source(), situationalDice: [], selected: changed.selected }, { abilityId: "focus", useId: "mind" });
    expect(selectedMind.selected).toEqual([{ abilityId: "focus", useId: "mind" }]);
  });

  it("excludes a Form below the Agent's level from the selectable options", () => {
    const restricted: AgentCheckAbilitySource = {
      ...source(),
      abilities: [{ id: "brute", name: "Bruto", resource: null, uses: [{ ...use("brute", { type: "any" }, 1), minimumLevel: 8 }] }],
    };
    const state = resolveCheckAbilityUseState({ check: skillCheck, source: restricted, situationalDice: [], selected: [] });
    expect(state.options).toMatchObject([{ available: false, unavailableReason: "minimumLevel" }]);
  });

  it("evaluates an alternate Form of the same selected Ability as a substitution instead of an addition", () => {
    const substitutionSource: AgentCheckAbilitySource = {
      level: 5, health: 10, determination: 4,
      abilities: [{
        id: "focus", name: "Foco", resource: null,
        uses: [
          use("physical-d4", { type: "attribute", attribute: "physical" }, 2),
          use("physical-d8", { type: "attribute", attribute: "physical" }, 4),
        ],
      }],
    };
    const withSmallDie = resolveCheckAbilityUseState({
      check: skillCheck, source: substitutionSource, situationalDice: [],
      selected: [{ abilityId: "focus", useId: "physical-d4" }],
    });
    expect(withSmallDie.selected).toEqual([{ abilityId: "focus", useId: "physical-d4" }]);
    expect(withSmallDie.options.find(({ useId }) => useId === "physical-d8")).toMatchObject({ available: true, selected: false });

    const substituted = toggleCheckAbilityUse(
      { check: skillCheck, source: substitutionSource, situationalDice: [], selected: withSmallDie.selected },
      { abilityId: "focus", useId: "physical-d8" },
    );
    expect(substituted.selected).toEqual([{ abilityId: "focus", useId: "physical-d8" }]);
    expect(substituted.costPlan.determination).toMatchObject({ amount: 4, remaining: 0 });
  });

  it("enforces aggregate cost and the shared four-die limit", () => {
    const aggregate = resolveCheckAbilityUseState({
      check: skillCheck, source: source(), situationalDice: [],
      selected: [{ abilityId: "focus", useId: "physical" }, { abilityId: "universal", useId: "any" }],
    });
    expect(aggregate.selected).toHaveLength(2);
    expect(aggregate.totalDice).toBe(4);
    expect(aggregate.options.find(({ useId }) => useId === "fighting")).toMatchObject({ available: false, unavailableReason: "diceLimit" });

    const short = { ...source(), determination: 4 };
    const unaffordable = resolveCheckAbilityUseState({
      check: skillCheck, source: short, situationalDice: [],
      selected: [{ abilityId: "focus", useId: "physical" }, { abilityId: "universal", useId: "any" }],
    });
    expect(unaffordable.selected).toEqual([{ abilityId: "focus", useId: "physical" }]);
    expect(unaffordable.options.find(({ useId }) => useId === "any")).toMatchObject({ available: false, unavailableReason: "insufficientDetermination" });
  });

  it("allows any and attribute integrations for Aptitude but never Skill integrations", () => {
    const aptitude = { ...skillCheck, check: { kind: "aptitude" as const, key: "arts", name: "Artes" }, components: [skillCheck.components[0]!, { kind: "specialization" as const, key: "arts", label: "Artes", die: 6 as const }] };
    const state = resolveCheckAbilityUseState({ check: aptitude, source: source(), situationalDice: [], selected: [] });
    expect(state.options.map(({ useId }) => useId)).toEqual(["physical", "any"]);
  });
});
