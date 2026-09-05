import { describe, expect, it } from "vitest";

import {
  SKILL_DEFINITIONS,
  type SkillDieStep,
} from "../../config/skills";
import type { AttributeKey } from "../../core/actors/agent-attributes";
import type { DieStep } from "../../core/dice/die-step";
import {
  buildAgentAttributeChoices,
  buildAgentCheck,
  parseAgentCheckSelection,
  type AgentCheckSource,
} from "./build-agent-check";

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  physical: "Físico",
  mind: "Mente",
  emotion: "Emoção",
};

function createSource(): AgentCheckSource {
  return {
    attributes: {
      physical: 6 as DieStep,
      mind: 8 as DieStep,
      emotion: 10 as DieStep,
    },
    skills: Object.fromEntries(
      SKILL_DEFINITIONS.map((definition) => [
        definition.key,
        "specializations" in definition
          ? Object.fromEntries(
              definition.specializations.map(({ key }) => [
                key,
                key === "arts" ? 6 : 4,
              ]),
            )
          : definition.key === "perception"
            ? 6
            : 4,
      ]),
    ) as AgentCheckSource["skills"],
  };
}

const localize = (key: string): string => {
  const entry = Object.entries(ATTRIBUTE_LABELS).find(([attribute]) =>
    key.toLowerCase().includes(attribute === "physical" ? "physical" : attribute),
  );

  return entry ? entry[1] : key;
};

describe("Agent check builder", () => {
  it("builds the three current attribute choices in registry order", () => {
    expect(buildAgentAttributeChoices(createSource(), localize)).toEqual([
      { key: "physical", label: "Físico", die: 6 },
      { key: "mind", label: "Mente", die: 8 },
      { key: "emotion", label: "Emoção", die: 10 },
    ]);
  });

  it("builds an attribute check", () => {
    const check = buildAgentCheck(
      { kind: "attribute", key: "physical" },
      createSource(),
      () => "Físico",
    );

    expect(check).toEqual({
      check: { kind: "attribute", key: "physical", name: "Físico" },
      components: [
        {
          kind: "attribute",
          key: "physical",
          label: "Físico",
          die: 6,
        },
      ],
      extraDice: [],
    });
  });

  it.each([
    ["mind", "Mente", 8],
    ["emotion", "Emoção", 10],
  ] as const)(
    "uses selected attribute %s without changing the skill component",
    (selectedAttribute, label, die) => {
      const check = buildAgentCheck(
        { kind: "skill", key: "acrobatics" },
        createSource(),
        localize,
        selectedAttribute,
      );

      expect(check.components).toEqual([
        { kind: "attribute", key: selectedAttribute, label, die },
        {
          kind: "skill",
          key: "acrobatics",
          label: "Acrobacia",
          die: 4,
        },
      ]);
    },
  );

  it("uses a selected attribute for an Aptitude specialization", () => {
    const check = buildAgentCheck(
      { kind: "aptitude", key: "arts" },
      createSource(),
      localize,
      "emotion",
    );

    expect(check.components).toEqual([
      { kind: "attribute", key: "emotion", label: "Emoção", die: 10 },
      {
        kind: "specialization",
        key: "arts",
        label: "Artes",
        die: 6,
      },
    ]);
  });

  it("rejects alternate attributes for a pure attribute check", () => {
    expect(() =>
      buildAgentCheck(
        { kind: "attribute", key: "physical" },
        createSource(),
        localize,
        "mind",
      ),
    ).toThrow("cannot select an alternate attribute");
  });

  it.each(
    SKILL_DEFINITIONS.filter(
      (definition) => !("specializations" in definition),
    ),
  )("resolves $key through its registered base attribute", (definition) => {
    const check = buildAgentCheck(
      parseAgentCheckSelection("skill", definition.key),
      createSource(),
      localize,
    );

    expect(check.components[0]).toEqual(
      expect.objectContaining({
        kind: "attribute",
        key: definition.baseAttribute,
      }),
    );
    expect(check.components[1]).toEqual(
      expect.objectContaining({ kind: "skill", key: definition.key }),
    );
  });

  it.each([
    ["arts", "Artes"],
    ["currentAffairs", "Atualidades"],
    ["bureaucracy", "Burocracia"],
    ["exactSciences", "Exatas"],
    ["humanities", "Humanas"],
    ["tactics", "Tática"],
  ] as const)("builds Aptitude specialization %s", (key, label) => {
    const check = buildAgentCheck(
      parseAgentCheckSelection("aptitude", key),
      createSource(),
      () => "Mente",
    );

    expect(check.check).toEqual({
      kind: "aptitude",
      key,
      name: `Aptidão: ${label}`,
    });
    expect(check.components).toEqual([
      expect.objectContaining({ kind: "attribute", key: "mind", die: 8 }),
      expect.objectContaining({ kind: "specialization", key, label }),
    ]);
  });

  it.each([
    [undefined, "physical"],
    ["attribute", "invalid"],
    ["skill", "aptitude"],
    ["skill", "invalid"],
    ["aptitude", "invalid"],
  ])("rejects invalid selection %s/%s", (kind, key) => {
    expect(() => parseAgentCheckSelection(kind, key)).toThrow();
  });
});
