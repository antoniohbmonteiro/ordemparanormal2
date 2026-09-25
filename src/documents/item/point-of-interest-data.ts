import { SKILL_DEFINITIONS, isSkillKey, type AptitudeSpecializationKey, type SkillKey } from "../../config/skills";

export const POINT_OF_INTEREST_DIFFICULTY_MIN = 1;
export type OrdinaryPoiSkillKey = Exclude<SkillKey, "aptitude">;
export type PointOfInterestApproach = {
  readonly skill: OrdinaryPoiSkillKey;
  readonly difficulty: number;
  readonly showDifficultyToPlayers: boolean;
} | {
  readonly skill: "aptitude";
  readonly specialization: AptitudeSpecializationKey;
  readonly difficulty: number;
  readonly showDifficultyToPlayers: boolean;
};
export const POINT_OF_INTEREST_AVAILABILITY_MODES = ["always", "situational"] as const;
export type PointOfInterestAvailabilityMode = typeof POINT_OF_INTEREST_AVAILABILITY_MODES[number];
/**
 * Whether an information can be investigated now. A situational condition is GM-facing text that the system
 * never interprets: the GM decides when it holds. It is unrelated to what an Agent already knows.
 */
export type PointOfInterestInformationAvailability =
  | { readonly mode: "always"; readonly condition: "" }
  | { readonly mode: "situational"; readonly condition: string };
// Not frozen: Foundry cleans update data in place, so written data always receives a copy of it.
export const POINT_OF_INTEREST_ALWAYS_AVAILABLE: PointOfInterestInformationAvailability = { mode: "always", condition: "" };
export interface PointOfInterestInformation {
  readonly id: string;
  readonly content: string;
  readonly approaches: readonly PointOfInterestApproach[];
  readonly availability: PointOfInterestInformationAvailability;
}
export interface PointOfInterestSystemData {
  readonly publicDescription: string;
  readonly gmContext: string;
  readonly information: readonly PointOfInterestInformation[];
}

const aptitude = SKILL_DEFINITIONS.find(definition => definition.key === "aptitude");
const specializationKeys = new Set<string>(
  aptitude && "specializations" in aptitude
    ? aptitude.specializations.map(specialization => specialization.key) : [],
);
export function isAptitudeSpecializationKey(value: unknown): value is AptitudeSpecializationKey {
  return typeof value === "string" && specializationKeys.has(value);
}
export function isPointOfInterestApproach(value: unknown): value is PointOfInterestApproach {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!isSkillKey(candidate.skill) || !Number.isInteger(candidate.difficulty)
    || (candidate.difficulty as number) < POINT_OF_INTEREST_DIFFICULTY_MIN
    || typeof candidate.showDifficultyToPlayers !== "boolean") return false;
  return candidate.skill === "aptitude"
    ? isAptitudeSpecializationKey(candidate.specialization)
    : candidate.specialization === undefined;
}
export function approachIdentity(approach: PointOfInterestApproach): string {
  return approach.skill === "aptitude" ? `${approach.skill}:${approach.specialization}` : approach.skill;
}
/**
 * Normalizes a stored availability. Information persisted before availability existed has none and is always
 * available; the DataModel supplies the same default when it cleans that source. Returns null when invalid.
 */
export function readPointOfInterestInformationAvailability(value: unknown): PointOfInterestInformationAvailability | null {
  if (value === undefined) return POINT_OF_INTEREST_ALWAYS_AVAILABLE;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { mode, condition } = value as Record<string, unknown>;
  if (mode === "always" && (condition === undefined || condition === "")) return POINT_OF_INTEREST_ALWAYS_AVAILABLE;
  return mode === "situational" && typeof condition === "string" && condition.trim()
    ? { mode, condition } : null;
}
export function isSituationalPointOfInterestInformation(entry: PointOfInterestInformation): boolean {
  return entry.availability.mode === "situational";
}
/**
 * Information a player may receive for an Agent: always-available information, plus situational information the
 * Agent already knows. Unknown situational information must not leave the GM client in any form.
 */
export function playerVisiblePointOfInterestInformation(
  information: readonly PointOfInterestInformation[], knownIds: ReadonlySet<string>,
): readonly PointOfInterestInformation[] {
  return information.filter(entry => !isSituationalPointOfInterestInformation(entry) || knownIds.has(entry.id));
}
export function isPointOfInterestInformation(value: unknown): value is PointOfInterestInformation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()
    || typeof candidate.content !== "string" || !Array.isArray(candidate.approaches)
    || candidate.approaches.length === 0 || !candidate.approaches.every(isPointOfInterestApproach)
    || !readPointOfInterestInformationAvailability(candidate.availability)) return false;
  const identities = candidate.approaches.map(approachIdentity);
  return new Set(identities).size === identities.length;
}
export function isPointOfInterestInformationList(value: unknown): value is readonly PointOfInterestInformation[] {
  if (!Array.isArray(value) || !value.every(isPointOfInterestInformation)) return false;
  const ids = value.map(entry => entry.id);
  return new Set(ids).size === ids.length;
}
/** Runtime reads never interpret the legacy grouped shape. */
export function readPointOfInterestInformation(system: unknown): readonly PointOfInterestInformation[] {
  if (!system || typeof system !== "object") return [];
  const value = (system as { readonly information?: unknown }).information;
  if (!isPointOfInterestInformationList(value)) return [];
  return value.map(entry => ({ id: entry.id, content: entry.content,
    approaches: entry.approaches.map(approach => approach.skill === "aptitude"
      ? { ...approach } : { skill: approach.skill, difficulty: approach.difficulty,
          showDifficultyToPlayers: approach.showDifficultyToPlayers }),
    availability: { ...readPointOfInterestInformationAvailability(entry.availability)! } }));
}
function assertValidInformation(list: readonly PointOfInterestInformation[]): void {
  if (!isPointOfInterestInformationList(list)) throw new Error("Invalid Point of Interest information.");
}
export function addPointOfInterestInformation(
  list: readonly PointOfInterestInformation[], id: string, approach: PointOfInterestApproach,
  content = "",
): readonly PointOfInterestInformation[] {
  const next = [...list, { id, content, approaches: [approach], availability: { ...POINT_OF_INTEREST_ALWAYS_AVAILABLE } }];
  assertValidInformation(next);
  return next;
}
export function updatePointOfInterestInformationAvailability(
  list: readonly PointOfInterestInformation[], id: string, availability: PointOfInterestInformationAvailability,
): readonly PointOfInterestInformation[] {
  if (!list.some(entry => entry.id === id)) throw new Error(`Unknown Point of Interest information id: ${id}`);
  const next = list.map(entry => entry.id === id ? { ...entry, availability: { ...availability } } : entry);
  assertValidInformation(next);
  return next;
}
export function updatePointOfInterestInformation(
  list: readonly PointOfInterestInformation[], id: string, content: string,
): readonly PointOfInterestInformation[] {
  if (!list.some(entry => entry.id === id)) throw new Error(`Unknown Point of Interest information id: ${id}`);
  const next = list.map(entry => entry.id === id ? { ...entry, content } : entry);
  assertValidInformation(next);
  return next;
}
export function removePointOfInterestInformation(
  list: readonly PointOfInterestInformation[], id: string,
): readonly PointOfInterestInformation[] {
  return list.filter(entry => entry.id !== id);
}
export function addPointOfInterestApproach(
  list: readonly PointOfInterestInformation[], id: string, approach: PointOfInterestApproach,
): readonly PointOfInterestInformation[] {
  if (!list.some(entry => entry.id === id)) throw new Error(`Unknown Point of Interest information id: ${id}`);
  const next = list.map(entry => entry.id === id
    ? { ...entry, approaches: [...entry.approaches, approach] } : entry);
  assertValidInformation(next);
  return next;
}
export function updatePointOfInterestApproach(
  list: readonly PointOfInterestInformation[], id: string, index: number,
  approach: PointOfInterestApproach,
): readonly PointOfInterestInformation[] {
  const entry = list.find(candidate => candidate.id === id);
  if (!entry || !entry.approaches[index]) throw new Error(`Unknown Point of Interest approach: ${id}/${index}`);
  const next = list.map(candidate => candidate.id === id
    ? { ...candidate, approaches: candidate.approaches.map((value, i) => i === index ? approach : value) }
    : candidate);
  assertValidInformation(next);
  return next;
}
export function removePointOfInterestApproach(
  list: readonly PointOfInterestInformation[], id: string, index: number,
): readonly PointOfInterestInformation[] {
  const entry = list.find(candidate => candidate.id === id);
  if (!entry || !entry.approaches[index] || entry.approaches.length === 1)
    throw new Error(`Cannot remove Point of Interest approach: ${id}/${index}`);
  return list.map(candidate => candidate.id === id
    ? { ...candidate, approaches: candidate.approaches.filter((_, i) => i !== index) }
    : candidate);
}

export type PoiInvestigationPlayerInformationView = (
  | { readonly visibility: "public"; readonly difficulty: number }
  | { readonly visibility: "hidden" }
) & { readonly content?: string; readonly specialization?: AptitudeSpecializationKey };
export interface PoiInvestigationPlayerSkillView {
  readonly key: SkillKey;
  readonly name: string;
  readonly information: readonly PoiInvestigationPlayerInformationView[];
}
/**
 * Information a player can still examine for. The sanitized projection already omits unknown situational
 * information and carries content only for known information, so an entry without content is undiscovered.
 */
export function examinablePlayerInformation(
  skill: PoiInvestigationPlayerSkillView,
): readonly PoiInvestigationPlayerInformationView[] {
  return skill.information.filter(entry => !Object.hasOwn(entry, "content"));
}
export function examinableAptitudeSpecializations(skill: PoiInvestigationPlayerSkillView): readonly AptitudeSpecializationKey[] {
  return [...new Set(examinablePlayerInformation(skill).flatMap(entry => entry.specialization ? [entry.specialization] : []))];
}
export interface PoiInvestigationGmInformationView {
  readonly id: string;
  readonly difficulty: number;
  readonly content: string;
  readonly showDifficultyToPlayers: boolean;
  readonly knownCount: number;
  readonly specialization?: AptitudeSpecializationKey;
  /** Present only for situational information; GM-private. */
  readonly condition?: string;
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
export interface PoiInvestigationPlayerViewData extends PoiInvestigationBaseViewData {
  readonly audience: "player";
  readonly skills: readonly PoiInvestigationPlayerSkillView[];
}
export interface PoiInvestigationGmViewData extends PoiInvestigationBaseViewData {
  readonly audience: "gm";
  readonly itemUuid: string;
  readonly skills: readonly PoiInvestigationGmSkillView[];
  readonly gmContext: string;
}
export type PoiInvestigationViewData = PoiInvestigationPlayerViewData | PoiInvestigationGmViewData;
