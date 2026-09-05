import {
  SKILL_DEFINITIONS,
  isSkillKey,
  type SkillKey,
} from "../../config/skills";
import {
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  type PointOfInterestInformation,
} from "../../documents/item/point-of-interest-data";

export interface SkillOptionViewModel {
  readonly value: SkillKey;
  readonly label: string;
}

/** Skill `<option>` view models, in canonical registry order. */
export const SKILL_OPTION_VIEW_MODELS: readonly SkillOptionViewModel[] =
  SKILL_DEFINITIONS.map((definition) => ({
    value: definition.key,
    label: definition.label,
  }));

const SKILL_LABEL_BY_KEY = new Map<SkillKey, string>(
  SKILL_OPTION_VIEW_MODELS.map((option) => [option.value, option.label]),
);

export interface InformationRowSkillOptionViewModel
  extends SkillOptionViewModel {
  readonly selected: boolean;
}

export interface InformationRowViewModel {
  readonly id: string;
  readonly skill: SkillKey;
  readonly skillLabel: string;
  readonly difficulty: number;
  readonly content: string;
  readonly skillOptions: readonly InformationRowSkillOptionViewModel[];
}

export function buildInformationRowViewModels(
  list: readonly PointOfInterestInformation[],
): readonly InformationRowViewModel[] {
  return list.map((entry) => ({
    id: entry.id,
    skill: entry.skill,
    skillLabel: SKILL_LABEL_BY_KEY.get(entry.skill) ?? entry.skill,
    difficulty: entry.difficulty,
    content: entry.content,
    skillOptions: SKILL_OPTION_VIEW_MODELS.map((option) => ({
      ...option,
      selected: option.value === entry.skill,
    })),
  }));
}

export type InformationEditPatch =
  | { readonly skill: SkillKey }
  | { readonly difficulty: number }
  | { readonly content: string };

/**
 * Validate one edited row field into a typed patch, or `null` when the raw
 * value is not acceptable (unknown skill, non-integer or out-of-range DT).
 */
export function readInformationEditPatch(
  field: string | undefined,
  rawValue: string,
): InformationEditPatch | null {
  switch (field) {
    case "skill":
      return isSkillKey(rawValue) ? { skill: rawValue } : null;
    case "difficulty": {
      const difficulty = Number(rawValue);
      return Number.isInteger(difficulty) &&
        difficulty >= POINT_OF_INTEREST_DIFFICULTY_MIN
        ? { difficulty }
        : null;
    }
    case "content":
      return { content: rawValue };
    default:
      return null;
  }
}
