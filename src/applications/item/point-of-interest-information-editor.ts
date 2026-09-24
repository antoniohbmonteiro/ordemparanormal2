import { SKILL_DEFINITIONS, type AptitudeSpecializationKey, type SkillKey } from "../../config/skills";
import {
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  type PointOfInterestApproach,
  type PointOfInterestInformation,
} from "../../documents/item/point-of-interest-data";

export interface SkillOptionViewModel { readonly value: SkillKey; readonly label: string }
export const SKILL_OPTION_VIEW_MODELS: readonly SkillOptionViewModel[] =
  SKILL_DEFINITIONS.map(({ key, label }) => ({ value: key, label }));
export const APTITUDE_OPTIONS = SKILL_DEFINITIONS.find(definition => definition.key === "aptitude")!
  .specializations.map(({ key, label }) => ({ value: key, label }));

export type ApproachViewModel = PointOfInterestApproach & {
  readonly index: number;
  readonly skillOptions: readonly (SkillOptionViewModel & { readonly selected: boolean })[];
  readonly specializationOptions: readonly { readonly value: AptitudeSpecializationKey; readonly label: string; readonly selected: boolean }[];
  readonly isAptitude: boolean;
};
export interface InformationViewModel {
  readonly id: string;
  readonly displayIndex: number;
  readonly content: string;
  readonly approaches: readonly ApproachViewModel[];
  readonly canAddApproach: boolean;
  readonly canRemoveApproach: boolean;
}

export function buildInformationViewModels(
  information: readonly PointOfInterestInformation[],
): readonly InformationViewModel[] {
  return information.map((entry, informationIndex) => ({
    id: entry.id,
    displayIndex: informationIndex + 1,
    content: entry.content,
    canAddApproach: entry.approaches.length < SKILL_OPTION_VIEW_MODELS.length - 1 + APTITUDE_OPTIONS.length,
    canRemoveApproach: entry.approaches.length > 1,
    approaches: entry.approaches.map((approach, index) => ({
      ...approach,
      index,
      isAptitude: approach.skill === "aptitude",
      skillOptions: SKILL_OPTION_VIEW_MODELS.map(option => ({ ...option, selected: option.value === approach.skill })),
      specializationOptions: APTITUDE_OPTIONS.map(option => ({ ...option,
        selected: approach.skill === "aptitude" && option.value === approach.specialization })),
    })),
  }));
}

export type ApproachFieldPatch = { readonly difficulty: number } | { readonly showDifficultyToPlayers: boolean };
export function readApproachFieldPatch(field: string | undefined, value: string): ApproachFieldPatch | null {
  if (field === "difficulty") {
    const difficulty = Number(value);
    return Number.isInteger(difficulty) && difficulty >= POINT_OF_INTEREST_DIFFICULTY_MIN
      ? { difficulty } : null;
  }
  if (field === "showDifficultyToPlayers") {
    return value === "true" || value === "false"
      ? { showDifficultyToPlayers: value === "true" } : null;
  }
  return null;
}
