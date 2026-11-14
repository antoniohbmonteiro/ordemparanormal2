import { getAttributeDefinition } from "../../config/attributes";
import { isCustomSkillKey, readSkillDie, type CustomSkillOption, type CustomSkillValues } from "../../core/actors/custom-skills";
import { createSkillDieStepControl } from "./agent-sheet-view-model";

export function buildCustomSkillRows(values: CustomSkillValues, options: readonly CustomSkillOption[]) {
  return Object.entries(values).flatMap(([key, value]) => {
    const die = readSkillDie(value);
    if (!isCustomSkillKey(key) || die === undefined) return [];
    const option = options.find(entry => entry.key === key);
    const label = option?.label ?? `Perícia indisponível (${key})`;
    const attributeLabelKey = option ? getAttributeDefinition(option.baseAttribute).labelKey : undefined;
    return [{
      key, label, attributeLabelKey, unavailable: !option, kind: "skill" as const,
      id: `skill:${key}`, isSpecialized: false as const,
      die: createSkillDieStepControl(`system.customSkills.${key}`, die),
    }];
  });
}
