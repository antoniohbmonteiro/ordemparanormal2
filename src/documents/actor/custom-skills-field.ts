import { SKILL_DIE_STEPS, type SkillDieStep } from "../../config/skills";
import { isCustomSkillKey } from "../../core/actors/custom-skills";

export function createCustomSkillsField() {
  // Foundry v14 supports validateKey, which the installed declaration omits.
  const options = { required: true, nullable: false, initial: {}, validateKey: isCustomSkillKey } as const;
  return new foundry.data.fields.TypedObjectField(
    new foundry.data.fields.NumberField<SkillDieStep, SkillDieStep, true, true, true>({
      required: true, nullable: true, initial: null, integer: true, choices: SKILL_DIE_STEPS,
    }),
    options,
  );
}
