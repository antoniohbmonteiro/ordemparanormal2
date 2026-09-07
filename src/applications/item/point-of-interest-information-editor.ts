import { SKILL_DEFINITIONS, type SkillKey } from "../../config/skills";
import {
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  type PointOfInterestInformation,
  type PointOfInterestSkill,
} from "../../documents/item/point-of-interest-data";

export interface SkillOptionViewModel {
  readonly value: SkillKey;
  readonly label: string;
}

export const SKILL_OPTION_VIEW_MODELS: readonly SkillOptionViewModel[] =
  SKILL_DEFINITIONS.map((definition) => ({
    value: definition.key,
    label: definition.label,
  }));

const SKILL_LABEL_BY_KEY = new Map<SkillKey, string>(
  SKILL_OPTION_VIEW_MODELS.map((option) => [option.value, option.label]),
);

export interface InformationRowViewModel extends PointOfInterestInformation {}

export interface PointOfInterestSkillGroupViewModel {
  readonly skill: SkillKey;
  readonly skillLabel: string;
  readonly information: readonly InformationRowViewModel[];
  readonly hasMultipleInformation: boolean;
}

/** Authoring groups in their persisted insertion order. */
export function buildSkillGroupViewModels(
  groups: readonly PointOfInterestSkill[],
): readonly PointOfInterestSkillGroupViewModel[] {
  return groups.map((group) => ({
    skill: group.skill,
    skillLabel: SKILL_LABEL_BY_KEY.get(group.skill) ?? group.skill,
    information: group.information.map((entry) => ({ ...entry })),
    hasMultipleInformation: group.information.length > 1,
  }));
}

/** Only skills not already owned by the POI, in canonical registry order. */
export function buildAvailableSkillOptions(
  groups: readonly PointOfInterestSkill[],
): readonly SkillOptionViewModel[] {
  const present = new Set(groups.map(({ skill }) => skill));
  return SKILL_OPTION_VIEW_MODELS.filter(({ value }) => !present.has(value));
}

export type InformationEditPatch =
  | { readonly difficulty: number }
  | { readonly content: string }
  | { readonly showDifficultyToPlayers: boolean };

export function readInformationEditPatch(
  field: string | undefined,
  rawValue: string,
): InformationEditPatch | null {
  switch (field) {
    case "difficulty": {
      const difficulty = Number(rawValue);
      return Number.isInteger(difficulty) &&
        difficulty >= POINT_OF_INTEREST_DIFFICULTY_MIN
        ? { difficulty }
        : null;
    }
    case "showDifficultyToPlayers":
      return rawValue === "true" || rawValue === "false"
        ? { showDifficultyToPlayers: rawValue === "true" }
        : null;
    case "content":
      return { content: rawValue };
    default:
      return null;
  }
}
