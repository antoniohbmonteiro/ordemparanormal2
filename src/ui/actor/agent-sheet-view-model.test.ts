import { describe, expect, it } from "vitest";

import {
  SKILL_DEFINITIONS,
  type SkillDieStep,
} from "../../config/skills";
import type { AttributeKey } from "../../core/actors/agent-attributes";
import type { DieStep } from "../../core/dice/die-step";
import {
  buildAgentSheetViewModel,
  type AgentSheetSource,
  type AgentSheetSystemData,
} from "./agent-sheet-view-model";

const ATTRIBUTE_VALUES: Record<AttributeKey, DieStep> = {
  physical: 6,
  mind: 8,
  emotion: 10,
};

function createSkills(): AgentSheetSystemData["skills"] {
  return Object.fromEntries(
    SKILL_DEFINITIONS.map((definition) => [
      definition.key,
      "specializations" in definition
        ? Object.fromEntries(
            definition.specializations.map(({ key }, index) => [
              key,
              [4, 6, 8, 10, 12, 4][index] as SkillDieStep,
            ]),
          )
        : definition.key === "acrobatics"
          ? 8
          : 4,
    ]),
  );
}

function createSource(
  abilities: AgentSheetSource["abilities"] = [],
  equipment: AgentSheetSource["equipment"] = [],
): AgentSheetSource {
  return {
    name: "Agente Teste",
    image: "icons/svg/mystery-man.svg",
    profile: {
      id: "profile-1",
      name: "Especialista",
      img: "icons/svg/item-bag.svg",
    },
    occupation: {
      id: "occupation-1",
      name: "Pesquisador",
      img: "icons/svg/item-bag.svg",
    },
    abilities,
    equipment,
    system: {
      occupation: "Pesquisador",
      level: 3,
      resources: {
        health: { value: 12, max: 10 },
        determination: { value: 6, max: 8 },
      },
      attributes: ATTRIBUTE_VALUES,
      skills: createSkills(),
    },
  };
}

describe("Agent Sheet view model", () => {
  it("preserves identity and resource update paths without clamping values", () => {
    const viewModel = buildAgentSheetViewModel(createSource());

    expect(viewModel.name).toBe("Agente Teste");
    expect(viewModel.resources).toEqual([
      expect.objectContaining({
        key: "health",
        value: 12,
        max: 10,
        valuePath: "system.resources.health.value",
        maxPath: "system.resources.health.max",
      }),
      expect.objectContaining({
        key: "determination",
        valuePath: "system.resources.determination.value",
        maxPath: "system.resources.determination.max",
      }),
    ]);
    expect(viewModel.profile).toEqual(
      expect.objectContaining({ selected: true, name: "Especialista" }),
    );
    expect(viewModel.occupation).toEqual(
      expect.objectContaining({ selected: true, name: "Pesquisador" }),
    );
  });

  it("builds attributes in canonical order with all DieSteps", () => {
    const { attributes } = buildAgentSheetViewModel(createSource());

    expect(attributes.map(({ key }) => key)).toEqual([
      "physical",
      "mind",
      "emotion",
    ]);
    expect(attributes.map(({ die }) => die.path)).toEqual([
      "system.attributes.physical",
      "system.attributes.mind",
      "system.attributes.emotion",
    ]);
    expect(attributes[0]?.die.options.map(({ value }) => value)).toEqual([
      4, 6, 8, 10, 12, 20,
    ]);
    expect(attributes.map(({ die }) => die.compactLabel)).toEqual([
      "d6",
      "d8",
      "d10",
    ]);
  });

  it("derives clamped visual percentages without changing resource values", () => {
    const resources = [
      { id: "two-thirds", value: 2, max: 3 },
      { id: "one-half", value: 5, max: 10 },
      { id: "two-fifths", value: 8, max: 20 },
      { id: "over-maximum", value: 12, max: 10 },
      { id: "zero-maximum", value: 7, max: 0 },
      { id: "empty", value: 0, max: 3 },
    ];
    const abilities: AgentSheetSource["abilities"] = resources.map(
      ({ id, value, max }) => ({
        id,
        name: id,
        img: "icons/svg/item-bag.svg",
        description: "",
        cost: { kind: "none", isNone: true },
        resource: { value, max },
      }),
    );

    const { abilities: cards } = buildAgentSheetViewModel(
      createSource(abilities),
    );

    expect(cards.map(({ resource }) => resource?.fillPercentage)).toEqual([
      66.67,
      50,
      40,
      100,
      0,
      0,
    ]);
    expect(cards.map(({ resource }) => resource && [resource.value, resource.max]))
      .toEqual([
        [2, 3],
        [5, 10],
        [8, 20],
        [12, 10],
        [7, 0],
        [0, 3],
      ]);
    expect(
      cards.map(({ resource }) =>
        resource && [resource.canDecrease, resource.canIncrease]
      ),
    ).toEqual([
      [true, true],
      [true, true],
      [true, true],
      [true, false],
      [true, false],
      [false, true],
    ]);
  });

  it("derives Equipment uses fill percentages and a category label key", () => {
    const equipment: AgentSheetSource["equipment"] = [
      {
        id: "with-uses",
        name: "Lanterna de Estouro Ultravioleta",
        img: "icons/svg/item-bag.svg",
        description: "",
        category: "tool",
        uses: { value: 2, max: 3 },
      },
      {
        id: "without-uses",
        name: "Termômetro Diferencial",
        img: "icons/svg/item-bag.svg",
        description: "",
        category: "tool",
        uses: null,
      },
    ];

    const { equipment: cards } = buildAgentSheetViewModel(
      createSource([], equipment),
    );

    expect(cards[0]).toMatchObject({
      hasUses: true,
      categoryLabelKey: "ORDEMPARANORMAL2.Equipment.Categories.tool",
      uses: { value: 2, max: 3, fillPercentage: 66.67, canDecrease: true, canIncrease: true },
    });
    expect(cards[1]).toMatchObject({ hasUses: false, uses: null });
  });

  it("preserves canonical skill order and exposes full attribute labels", () => {
    const { skills } = buildAgentSheetViewModel(createSource());

    expect(skills.map(({ key, label }) => [key, label])).toEqual(
      SKILL_DEFINITIONS.map(({ key, label }) => [key, label]),
    );
    expect(skills).toHaveLength(20);
    expect(skills.filter(({ isSpecialized }) => !isSpecialized)).toHaveLength(
      19,
    );
    expect(skills[0]?.attributeLabelKey).toContain("Physical");
    expect(skills[0]?.attributeLabelKey).not.toContain("Short");
    expect(skills[1]?.attributeLabelKey).toContain("Mind");
  });

  it("separates compact skill values from full grade option labels", () => {
    const acrobatics = buildAgentSheetViewModel(createSource()).skills[0];

    expect(acrobatics?.isSpecialized).toBe(false);
    if (!acrobatics || acrobatics.isSpecialized) return;

    expect(acrobatics.die.compactLabel).toBe("d8");
    expect(acrobatics.die.options.map(({ value }) => value)).toEqual([
      4, 6, 8, 10, 12,
    ]);
    expect(
      acrobatics.die.options.map(({ gradeLabelKey }) => gradeLabelKey),
    ).toEqual([
      expect.stringContaining("Untrained"),
      expect.stringContaining("Trained"),
      expect.stringContaining("Specialist"),
      expect.stringContaining("Master"),
      expect.stringContaining("GrandMaster"),
    ]);
    expect(
      acrobatics.die.options.filter(({ selected }) => selected),
    ).toEqual([expect.objectContaining({ value: 8 })]);
  });

  it("models Aptitude only through its six specialization paths", () => {
    const aptitude = buildAgentSheetViewModel(createSource()).skills.find(
      ({ key }) => key === "aptitude",
    );

    expect(aptitude?.isSpecialized).toBe(true);
    if (!aptitude || !aptitude.isSpecialized) return;

    expect(aptitude).not.toHaveProperty("die");
    expect(aptitude.specializations.map(({ key, label }) => [key, label])).toEqual(
      [
        ["arts", "Artes"],
        ["currentAffairs", "Atualidades"],
        ["bureaucracy", "Burocracia"],
        ["exactSciences", "Exatas"],
        ["humanities", "Humanas"],
        ["tactics", "Tática"],
      ],
    );
    expect(aptitude.specializations.map(({ die }) => die.path)).toEqual([
      "system.skills.aptitude.arts",
      "system.skills.aptitude.currentAffairs",
      "system.skills.aptitude.bureaucracy",
      "system.skills.aptitude.exactSciences",
      "system.skills.aptitude.humanities",
      "system.skills.aptitude.tactics",
    ]);
    expect(aptitude.specializations.map(({ die }) => die.compactLabel)).toEqual([
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d4",
    ]);
  });
});
