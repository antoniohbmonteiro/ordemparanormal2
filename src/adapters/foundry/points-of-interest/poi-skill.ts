import { isCustomSkillId, isCustomSkillKey } from "../../../core/actors/custom-skills";
import { aptitudeSpecializationLabel, isSkillKey, skillLabel } from "../../../config/skills";
import {
  isAptitudeSpecializationKey, isSkillApproach, parsePoiSkillSelection, readPointOfInterestInformation,
} from "../../../documents/item/point-of-interest-data";
import { worldCustomSkillOptions } from "../actors/custom-skill-catalog";
import { resolveOwnedCustomSkill } from "../actors/actor-custom-skills";

export function currentPoiCustomSkillDie(actor: foundry.documents.Actor, item: foundry.documents.Item, skill: string, specialization?: string) {
  if (!isCustomSkillId(skill)) return;
  const selection = parsePoiSkillSelection(skill, specialization);
  if (selection && isCustomSkillKey(selection.key)
    && readPointOfInterestInformation(item.system).some(entry => entry.approaches.some(approach =>
      isSkillApproach(approach) && approach.skill === skill && approach.specialization === specialization))) {
    return resolveOwnedCustomSkill(actor, selection.key)?.die;
  }
}

export function poiSkillLabel(skill: string, specialization?: string) {
  if (isCustomSkillId(skill)) {
    const selection = parsePoiSkillSelection(skill, specialization);
    return worldCustomSkillOptions().find(option => option.key === selection?.key)?.label ?? `Perícia indisponível (${skill})`;
  }
  if (skill === "aptitude" && isAptitudeSpecializationKey(specialization)) return aptitudeSpecializationLabel(specialization);
  return isSkillKey(skill) ? skillLabel(skill) : skill;
}
