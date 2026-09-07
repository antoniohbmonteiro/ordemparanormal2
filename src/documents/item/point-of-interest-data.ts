import { isSkillKey, type SkillKey } from "../../config/skills";

/** Minimum confirmed Difficulty for Point of Interest information. */
export const POINT_OF_INTEREST_DIFFICULTY_MIN = 1;

/** A stable, skill-owned piece of information. */
export interface PointOfInterestInformation {
  readonly id: string;
  readonly difficulty: number;
  readonly content: string;
  readonly showDifficultyToPlayers: boolean;
}

/** The canonical group for one skill inside a Point of Interest. */
export interface PointOfInterestSkill {
  readonly skill: SkillKey;
  readonly information: readonly PointOfInterestInformation[];
}

/** Persisted `system` shape of a Point of Interest Item. */
export interface PointOfInterestSystemData {
  readonly publicDescription: string;
  readonly gmContext: string;
  readonly skills: readonly PointOfInterestSkill[];
}

export type PointOfInterestInformationDraft = {
  readonly difficulty: number;
  readonly content?: string;
  readonly showDifficultyToPlayers?: boolean;
};

export type PointOfInterestInformationPatch = Partial<
  Pick<PointOfInterestInformation, "difficulty" | "content" | "showDifficultyToPlayers">
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
    typeof candidate.difficulty === "number" &&
    Number.isInteger(candidate.difficulty) &&
    candidate.difficulty >= POINT_OF_INTEREST_DIFFICULTY_MIN &&
    typeof candidate.content === "string" &&
    typeof candidate.showDifficultyToPlayers === "boolean"
  );
}

export function isPointOfInterestSkill(value: unknown): value is PointOfInterestSkill {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PointOfInterestSkill>;
  return (
    isSkillKey(candidate.skill) &&
    Array.isArray(candidate.information) &&
    candidate.information.length > 0 &&
    candidate.information.every(isPointOfInterestInformation)
  );
}

/**
 * Defensively reads only the current grouped shape. Invalid or duplicate
 * groups and entries are omitted; the removed flat shape is never interpreted.
 */
export function readPointOfInterestSkills(system: unknown): readonly PointOfInterestSkill[] {
  if (!system || typeof system !== "object") return [];
  const skills = (system as { readonly skills?: unknown }).skills;
  if (!Array.isArray(skills)) return [];

  const seenSkills = new Set<SkillKey>();
  const seenInformationIds = new Set<string>();
  const result: PointOfInterestSkill[] = [];

  for (const value of skills) {
    if (!isPointOfInterestSkill(value) || seenSkills.has(value.skill)) continue;
    const ids = value.information.map(({ id }) => id);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => seenInformationIds.has(id))
    ) continue;

    seenSkills.add(value.skill);
    ids.forEach((id) => seenInformationIds.add(id));
    result.push({
      skill: value.skill,
      information: value.information.map((entry) => ({
        id: entry.id,
        difficulty: entry.difficulty,
        content: entry.content,
        showDifficultyToPlayers: entry.showDifficultyToPlayers,
      })),
    });
  }
  return result;
}

export type PoiInvestigationPlayerInformationView =
  | {
      readonly visibility: "public";
      readonly difficulty: number;
    }
  | {
      readonly visibility: "hidden";
    };

export interface PoiInvestigationPlayerSkillView {
  readonly key: SkillKey;
  readonly name: string;
  readonly information: readonly PoiInvestigationPlayerInformationView[];
}

export interface PoiInvestigationGmInformationView {
  readonly difficulty: number;
  readonly content: string;
  readonly showDifficultyToPlayers: boolean;
}

export interface PoiInvestigationGmSkillView {
  readonly key: SkillKey;
  readonly name: string;
  readonly information: readonly PoiInvestigationGmInformationView[];
}

interface PoiInvestigationBaseViewData {
  readonly name: string;
  readonly description: string;
  readonly img: string;
}

/** Whitelisted player presentation; array length intentionally exposes clue count. */
export interface PoiInvestigationPlayerViewData
  extends PoiInvestigationBaseViewData {
  readonly audience: "player";
  readonly skills: readonly PoiInvestigationPlayerSkillView[];
}

/** Full local-GM presentation; never returned to a non-GM requester. */
export interface PoiInvestigationGmViewData extends PoiInvestigationBaseViewData {
  readonly audience: "gm";
  readonly skills: readonly PoiInvestigationGmSkillView[];
  readonly gmContext: string;
}

export type PoiInvestigationViewData =
  | PoiInvestigationPlayerViewData
  | PoiInvestigationGmViewData;

function assertInformationIdAvailable(
  skills: readonly PointOfInterestSkill[],
  id: string,
): void {
  if (!isNonBlankString(id)) {
    throw new Error("Point of Interest information id must be non-blank.");
  }
  if (skills.some((group) => group.information.some((entry) => entry.id === id))) {
    throw new Error(`Point of Interest information id already exists: ${id}`);
  }
}

function createInformation(
  id: string,
  draft: PointOfInterestInformationDraft,
): PointOfInterestInformation {
  const information = {
    id,
    difficulty: draft.difficulty,
    content: draft.content ?? "",
    showDifficultyToPlayers: draft.showDifficultyToPlayers === true,
  };
  if (!isPointOfInterestInformation(information)) {
    throw new Error("Invalid Point of Interest information.");
  }
  return information;
}

export function addPointOfInterestSkill(
  skills: readonly PointOfInterestSkill[],
  skill: SkillKey,
  informationId: string,
  draft: PointOfInterestInformationDraft,
): readonly PointOfInterestSkill[] {
  if (skills.some((group) => group.skill === skill)) {
    throw new Error(`Point of Interest skill already exists: ${skill}`);
  }
  assertInformationIdAvailable(skills, informationId);
  return [
    ...skills,
    { skill, information: [createInformation(informationId, draft)] },
  ];
}

export function addPointOfInterestInformation(
  skills: readonly PointOfInterestSkill[],
  skill: SkillKey,
  informationId: string,
  draft: PointOfInterestInformationDraft,
): readonly PointOfInterestSkill[] {
  if (!skills.some((group) => group.skill === skill)) {
    throw new Error(`Unknown Point of Interest skill: ${skill}`);
  }
  assertInformationIdAvailable(skills, informationId);
  const information = createInformation(informationId, draft);
  return skills.map((group) =>
    group.skill === skill
      ? { ...group, information: [...group.information, information] }
      : group,
  );
}

export function updatePointOfInterestInformation(
  skills: readonly PointOfInterestSkill[],
  skill: SkillKey,
  informationId: string,
  patch: PointOfInterestInformationPatch,
): readonly PointOfInterestSkill[] {
  const group = skills.find((candidate) => candidate.skill === skill);
  const current = group?.information.find(({ id }) => id === informationId);
  if (!current) {
    throw new Error(`Unknown Point of Interest information id: ${informationId}`);
  }
  const updated = { ...current, ...patch };
  if (!isPointOfInterestInformation(updated)) {
    throw new Error("Invalid Point of Interest information.");
  }
  return skills.map((candidate) =>
    candidate.skill === skill
      ? {
          ...candidate,
          information: candidate.information.map((entry) =>
            entry.id === informationId ? updated : entry,
          ),
        }
      : candidate,
  );
}

/** Removes the group too when its last information is removed. */
export function removePointOfInterestInformation(
  skills: readonly PointOfInterestSkill[],
  skill: SkillKey,
  informationId: string,
): readonly PointOfInterestSkill[] {
  return skills.flatMap((group) => {
    if (group.skill !== skill) return [group];
    const information = group.information.filter(({ id }) => id !== informationId);
    return information.length > 0 ? [{ ...group, information }] : [];
  });
}

export function removePointOfInterestSkill(
  skills: readonly PointOfInterestSkill[],
  skill: SkillKey,
): readonly PointOfInterestSkill[] {
  return skills.filter((group) => group.skill !== skill);
}
