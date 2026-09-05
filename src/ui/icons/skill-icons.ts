import { SYSTEM_ID } from "../../config/system-config";
import type {
  AptitudeSpecializationKey,
  SkillKey,
} from "../../config/skills";

const SKILL_ICON_ROOT = `systems/${SYSTEM_ID}/assets/icons/skills`;

export const SKILL_ICON_PATHS = {
  acrobatics: `${SKILL_ICON_ROOT}/acrobatics.svg`,
  aptitude: `${SKILL_ICON_ROOT}/aptitude.svg`,
  athletics: `${SKILL_ICON_ROOT}/athletics.svg`,
  crime: `${SKILL_ICON_ROOT}/crime.svg`,
  discipline: `${SKILL_ICON_ROOT}/discipline.svg`,
  deception: `${SKILL_ICON_ROOT}/deception.svg`,
  stealth: `${SKILL_ICON_ROOT}/stealth.svg`,
  intimidation: `${SKILL_ICON_ROOT}/intimidation.svg`,
  intuition: `${SKILL_ICON_ROOT}/intuition.svg`,
  fighting: `${SKILL_ICON_ROOT}/fighting.svg`,
  machinery: `${SKILL_ICON_ROOT}/machinery.svg`,
  medicine: `${SKILL_ICON_ROOT}/medicine.svg`,
  occultism: `${SKILL_ICON_ROOT}/occultism.svg`,
  perception: `${SKILL_ICON_ROOT}/perception.svg`,
  persuasion: `${SKILL_ICON_ROOT}/persuasion.svg`,
  research: `${SKILL_ICON_ROOT}/research.svg`,
  marksmanship: `${SKILL_ICON_ROOT}/marksmanship.svg`,
  survival: `${SKILL_ICON_ROOT}/survival.svg`,
  technology: `${SKILL_ICON_ROOT}/technology.svg`,
  vigor: `${SKILL_ICON_ROOT}/vigor.svg`,
} as const satisfies Readonly<Record<SkillKey, string>>;

export const APTITUDE_SPECIALIZATION_ICON_PATHS = {
  arts: `${SKILL_ICON_ROOT}/aptitude/arts.svg`,
  currentAffairs: `${SKILL_ICON_ROOT}/aptitude/current-affairs.svg`,
  bureaucracy: `${SKILL_ICON_ROOT}/aptitude/bureaucracy.svg`,
  exactSciences: `${SKILL_ICON_ROOT}/aptitude/exact-sciences.svg`,
  humanities: `${SKILL_ICON_ROOT}/aptitude/humanities.svg`,
  tactics: `${SKILL_ICON_ROOT}/aptitude/tactics.svg`,
} as const satisfies Readonly<Record<AptitudeSpecializationKey, string>>;

export function resolveSkillIconPath(key: string): string | undefined {
  return Object.hasOwn(SKILL_ICON_PATHS, key)
    ? SKILL_ICON_PATHS[key as SkillKey]
    : undefined;
}

export function resolveAptitudeSpecializationIconPath(
  key: string,
): string | undefined {
  return Object.hasOwn(APTITUDE_SPECIALIZATION_ICON_PATHS, key)
    ? APTITUDE_SPECIALIZATION_ICON_PATHS[
        key as AptitudeSpecializationKey
      ]
    : undefined;
}
