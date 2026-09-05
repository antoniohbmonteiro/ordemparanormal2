import { describe, expect, it } from "vitest";

import { AGENT_ATTRIBUTE_KEYS } from "../core/actors/agent-attributes";
import {
  DEFAULT_SKILL_DIE,
  isSkillKey,
  SKILL_DEFINITIONS,
  SKILL_DIE_STEPS,
  SKILL_KEYS,
} from "./skills";

const EXPECTED_SKILLS = [
  ["acrobatics", "Acrobacia", "physical"],
  ["aptitude", "Aptidão", "mind"],
  ["athletics", "Atletismo", "physical"],
  ["crime", "Crime", "physical"],
  ["discipline", "Disciplina", "emotion"],
  ["deception", "Enganação", "emotion"],
  ["stealth", "Furtividade", "physical"],
  ["intimidation", "Intimidar", "emotion"],
  ["intuition", "Intuição", "emotion"],
  ["fighting", "Luta", "physical"],
  ["machinery", "Máquinas", "mind"],
  ["medicine", "Medicina", "mind"],
  ["occultism", "Ocultismo", "mind"],
  ["perception", "Percepção", "mind"],
  ["persuasion", "Persuasão", "emotion"],
  ["research", "Pesquisar", "mind"],
  ["marksmanship", "Pontaria", "physical"],
  ["survival", "Sobrevivência", "mind"],
  ["technology", "Tecnologia", "mind"],
  ["vigor", "Vigor", "physical"],
] as const;

const EXPECTED_APTITUDE_SPECIALIZATIONS = [
  ["arts", "Artes"],
  ["currentAffairs", "Atualidades"],
  ["bureaucracy", "Burocracia"],
  ["exactSciences", "Exatas"],
  ["humanities", "Humanas"],
  ["tactics", "Tática"],
] as const;

describe("skill registry", () => {
  it("preserves canonical skill metadata and order", () => {
    expect(
      SKILL_DEFINITIONS.map(({ key, label, baseAttribute }) => [
        key,
        label,
        baseAttribute,
      ]),
    ).toEqual(EXPECTED_SKILLS);
  });

  it("contains exactly twenty unique skill keys", () => {
    const keys = SKILL_DEFINITIONS.map(({ key }) => key);

    expect(keys).toHaveLength(20);
    expect(new Set(keys)).toHaveLength(20);
  });

  it("uses only registered Agent attributes", () => {
    const attributes = new Set(AGENT_ATTRIBUTE_KEYS);

    for (const definition of SKILL_DEFINITIONS) {
      expect(attributes.has(definition.baseAttribute)).toBe(true);
    }
  });

  it("preserves Aptitude specialization metadata and order", () => {
    const aptitude = SKILL_DEFINITIONS.find(
      (definition) => "specializations" in definition,
    );

    expect(aptitude?.key).toBe("aptitude");
    expect(aptitude?.specializations?.map(({ key, label }) => [key, label])).toEqual(
      EXPECTED_APTITUDE_SPECIALIZATIONS,
    );
  });

  it("uses d4 as the shared technical default", () => {
    expect(DEFAULT_SKILL_DIE).toBe(4);
    expect(SKILL_DIE_STEPS).toEqual([4, 6, 8, 10, 12]);
    expect(SKILL_DIE_STEPS).not.toContain(20);
  });

  it("exposes a flat canonical key list derived from the registry", () => {
    expect(SKILL_KEYS).toEqual(SKILL_DEFINITIONS.map(({ key }) => key));
    expect(SKILL_KEYS).toHaveLength(20);
    expect(new Set(SKILL_KEYS)).toHaveLength(20);
  });

  it("recognizes only canonical skill keys", () => {
    expect(isSkillKey("perception")).toBe(true);
    expect(isSkillKey("aptitude")).toBe(true);
    expect(isSkillKey("Percepção")).toBe(false);
    expect(isSkillKey("")).toBe(false);
    expect(isSkillKey(3)).toBe(false);
    expect(isSkillKey(null)).toBe(false);
  });
});
