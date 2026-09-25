import { SKILL_DEFINITIONS, type AptitudeSpecializationKey, type SkillKey } from "../../config/skills";
import {
  POINT_OF_INTEREST_AVAILABILITY_MODES,
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  approachIdentity,
  type PointOfInterestApproach,
  type PointOfInterestAvailabilityMode,
  type PointOfInterestDifficultyOverride,
  type PointOfInterestInformation,
  type PointOfInterestInformationAvailability,
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
  readonly showDifficultyOverride: boolean;
  readonly overrideDifficulty: string;
  readonly overrideCondition: string;
};
/** Local key of an alternative DT added in the sheet but not saved yet; approaches are unique per information. */
export function difficultyOverrideDraftKey(informationId: string, approach: PointOfInterestApproach): string {
  return `${informationId}:${approachIdentity(approach)}`;
}
const AVAILABILITY_LABELS: Readonly<Record<PointOfInterestAvailabilityMode, string>> = {
  always: "ORDEMPARANORMAL2.PointOfInterestSheet.Availability.Always",
  situational: "ORDEMPARANORMAL2.PointOfInterestSheet.Availability.Situational",
};
export interface InformationViewModel {
  readonly id: string;
  readonly displayIndex: number;
  readonly content: string;
  readonly availabilityOptions: readonly {
    readonly value: PointOfInterestAvailabilityMode; readonly label: string; readonly selected: boolean;
  }[];
  readonly showCondition: boolean;
  readonly condition: string;
  readonly approaches: readonly ApproachViewModel[];
  readonly canAddApproach: boolean;
  readonly canRemoveApproach: boolean;
}

/**
 * `pendingSituational` holds always-available information the GM switched to Situacional in this sheet but whose
 * condition is not written yet; `pendingOverrides` holds approaches whose alternative DT was added but not completed.
 * Both are local presentation state until valid values are saved.
 */
export function buildInformationViewModels(
  information: readonly PointOfInterestInformation[],
  pendingSituational: ReadonlySet<string> = new Set<string>(),
  pendingOverrides: ReadonlySet<string> = new Set<string>(),
): readonly InformationViewModel[] {
  return information.map((entry, informationIndex) => {
    const mode = pendingSituational.has(entry.id) ? "situational" : entry.availability.mode;
    return {
      id: entry.id,
      displayIndex: informationIndex + 1,
      content: entry.content,
      availabilityOptions: POINT_OF_INTEREST_AVAILABILITY_MODES.map(value => ({
        value, label: AVAILABILITY_LABELS[value], selected: value === mode })),
      showCondition: mode === "situational",
      condition: entry.availability.condition,
      canAddApproach: entry.approaches.length < SKILL_OPTION_VIEW_MODELS.length - 1 + APTITUDE_OPTIONS.length,
      canRemoveApproach: entry.approaches.length > 1,
      approaches: entry.approaches.map((approach, index) => ({
        ...approach,
        index,
        isAptitude: approach.skill === "aptitude",
        skillOptions: SKILL_OPTION_VIEW_MODELS.map(option => ({ ...option, selected: option.value === approach.skill })),
        specializationOptions: APTITUDE_OPTIONS.map(option => ({ ...option,
          selected: approach.skill === "aptitude" && option.value === approach.specialization })),
        showDifficultyOverride: !!approach.difficultyOverride
          || pendingOverrides.has(difficultyOverrideDraftKey(entry.id, approach)),
        overrideDifficulty: approach.difficultyOverride ? String(approach.difficultyOverride.difficulty) : "",
        overrideCondition: approach.difficultyOverride?.condition ?? "",
      })),
    };
  });
}

/** An alternative DT needs an integer DT >= 1 and a non-blank condition; null means it is not complete or valid. */
export function readDifficultyOverride(difficulty: string, condition: string): PointOfInterestDifficultyOverride | null {
  const value = Number(difficulty);
  const text = condition.trim();
  return difficulty.trim() && Number.isInteger(value) && value >= POINT_OF_INTEREST_DIFFICULTY_MIN && text
    ? { difficulty: value, condition: text } : null;
}

/** A situational information requires a non-blank condition; null rejects the edit. */
export function readSituationalAvailability(condition: string): PointOfInterestInformationAvailability | null {
  const value = condition.trim();
  return value ? { mode: "situational", condition: value } : null;
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
