import { isSkillKey, type SkillKey } from "../../config/skills";

/**
 * Minimum Difficulty for a Point of Interest information entry.
 *
 * Mirrors the constraint enforced by the core check domain
 * (`resolveCheckDifficulty`): a positive integer, with no confirmed upper bound.
 */
export const POINT_OF_INTEREST_DIFFICULTY_MIN = 1;

/**
 * A single skill-gated piece of information a Point of Interest can reveal.
 *
 * `id` is a stable identity generated once when the entry is created; it must
 * survive editing and reordering so a future investigation-execution layer can
 * reference entries by id rather than by array position.
 */
export interface PointOfInterestInformation {
  readonly id: string;
  readonly skill: SkillKey;
  readonly difficulty: number;
  readonly content: string;
}

/** Persisted `system` shape of a Point of Interest Item. */
export interface PointOfInterestSystemData {
  readonly publicDescription: string;
  readonly gmContext: string;
  readonly showDifficultiesToPlayers: boolean;
  readonly information: readonly PointOfInterestInformation[];
}

export type PointOfInterestInformationDraft = {
  readonly skill: SkillKey;
  readonly difficulty: number;
  readonly content?: string;
};

export type PointOfInterestInformationPatch = Partial<
  Pick<PointOfInterestInformation, "skill" | "difficulty" | "content">
>;

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPointOfInterestInformation(
  value: unknown,
): value is PointOfInterestInformation {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PointOfInterestInformation>;
  return (
    isNonBlankString(candidate.id) &&
    isSkillKey(candidate.skill) &&
    typeof candidate.difficulty === "number" &&
    Number.isInteger(candidate.difficulty) &&
    candidate.difficulty >= POINT_OF_INTEREST_DIFFICULTY_MIN &&
    typeof candidate.content === "string"
  );
}

/**
 * Defensively read the information list from unknown `system` data.
 *
 * Structurally invalid entries — blank id, non-canonical skill, non-integer or
 * out-of-range difficulty, non-string content — are dropped rather than coerced.
 */
export function readPointOfInterestInformationList(
  system: unknown,
): readonly PointOfInterestInformation[] {
  if (!system || typeof system !== "object") return [];

  const information = (system as { readonly information?: unknown }).information;
  if (!Array.isArray(information)) return [];

  return information.flatMap((entry) =>
    isPointOfInterestInformation(entry)
      ? [
          {
            id: entry.id,
            skill: entry.skill,
            difficulty: entry.difficulty,
            content: entry.content,
          },
        ]
      : [],
  );
}

export function assertUniquePointOfInterestInformationIds(
  list: readonly PointOfInterestInformation[],
): void {
  const ids = list.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Point of Interest information ids must be unique.");
  }
}

export function addPointOfInterestInformation(
  list: readonly PointOfInterestInformation[],
  id: string,
  draft: PointOfInterestInformationDraft,
): readonly PointOfInterestInformation[] {
  if (!isNonBlankString(id)) {
    throw new Error("Point of Interest information id must be a non-blank string.");
  }
  if (list.some((entry) => entry.id === id)) {
    throw new Error(`Point of Interest information id already exists: ${id}`);
  }

  return [
    ...list,
    {
      id,
      skill: draft.skill,
      difficulty: draft.difficulty,
      content: draft.content ?? "",
    },
  ];
}

export function updatePointOfInterestInformation(
  list: readonly PointOfInterestInformation[],
  id: string,
  patch: PointOfInterestInformationPatch,
): readonly PointOfInterestInformation[] {
  if (!list.some((entry) => entry.id === id)) {
    throw new Error(`Unknown Point of Interest information id: ${id}`);
  }

  return list.map((entry) =>
    entry.id === id ? { ...entry, ...patch } : entry,
  );
}

export function removePointOfInterestInformation(
  list: readonly PointOfInterestInformation[],
  id: string,
): readonly PointOfInterestInformation[] {
  return list.filter((entry) => entry.id !== id);
}
