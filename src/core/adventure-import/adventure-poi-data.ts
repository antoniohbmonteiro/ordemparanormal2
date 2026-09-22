import { isSkillKey } from "../../config/skills";
import { POINT_OF_INTEREST_DIFFICULTY_MIN, type PointOfInterestSystemData } from "../../documents/item/point-of-interest-data";
import type { AdventureDefinition } from "./adventure-definition";
import type { AdventureAct } from "./recognize-zip-source";

export interface AdventurePoiPreset extends PointOfInterestSystemData {
  readonly id: string;
  readonly act: AdventureAct;
  readonly name: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function keysAre(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}

export function validateAdventurePoiData(value: unknown): asserts value is AdventurePoiPreset {
  const preset = record(value);
  if (!preset || !keysAre(preset, ["id", "act", "name", "publicDescription", "gmContext", "skills"])
    || (preset.act !== "actOne" && preset.act !== "actTwo")
    || typeof preset.id !== "string" || !preset.id.startsWith(`${preset.act}.`)
    || typeof preset.name !== "string" || !preset.name.trim()
    || typeof preset.publicDescription !== "string" || typeof preset.gmContext !== "string"
    || !Array.isArray(preset.skills)) throw new Error("Preset de POI inválido.");

  const seenSkills = new Set<string>();
  const seenIds = new Set<string>();
  for (const value of preset.skills) {
    const group = record(value);
    if (!group || !keysAre(group, ["skill", "information"]) || !isSkillKey(group.skill)
      || seenSkills.has(group.skill) || !Array.isArray(group.information) || !group.information.length) {
      throw new Error(`Grupo de perícia inválido no POI ${preset.id}.`);
    }
    seenSkills.add(group.skill);
    for (const value of group.information) {
      const entry = record(value);
      if (!entry || !keysAre(entry, ["id", "difficulty", "content", "showDifficultyToPlayers"])
        || typeof entry.id !== "string" || !entry.id.trim() || seenIds.has(entry.id)
        || typeof entry.difficulty !== "number" || !Number.isInteger(entry.difficulty)
        || entry.difficulty < POINT_OF_INTEREST_DIFFICULTY_MIN
        || typeof entry.content !== "string" || !entry.content.trim()
        || entry.showDifficultyToPlayers !== false) {
        throw new Error(`Informação inválida no POI ${preset.id}.`);
      }
      seenIds.add(entry.id);
    }
  }
}

export function validateAdventurePoiReferences(definition: AdventureDefinition, presets: readonly unknown[]): asserts presets is readonly AdventurePoiPreset[] {
  for (const preset of presets) validateAdventurePoiData(preset);
  const catalog = presets as readonly AdventurePoiPreset[];
  const ids = new Set(catalog.map(preset => preset.id));
  const references = definition.pointsOfInterest.map(ref => ref.presetId);
  if (ids.size !== catalog.length || new Set(references).size !== references.length
    || ids.size !== references.length || references.some(id => !ids.has(id))) {
    throw new Error("Referências de POI ausentes ou duplicadas.");
  }
}

export function poiSystem(preset: AdventurePoiPreset): PointOfInterestSystemData {
  return { publicDescription: preset.publicDescription, gmContext: preset.gmContext, skills: preset.skills };
}
