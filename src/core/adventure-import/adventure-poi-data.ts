import { isPointOfInterestInformationList, type PointOfInterestSystemData } from "../../documents/item/point-of-interest-data";
import type { AdventureDefinition } from "./adventure-definition";
import type { AdventureAct } from "./recognize-zip-source";

export interface AdventurePoiPreset extends PointOfInterestSystemData {
  readonly id: string;
  readonly act: AdventureAct;
  readonly name: string;
  readonly imageAssetId?: string;
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
  if (!preset || !keysAre(preset, ["id", "act", "name", "publicDescription", "gmContext", "information",
    ...(preset.imageAssetId === undefined ? [] : ["imageAssetId"])])
    || (preset.act !== "actOne" && preset.act !== "actTwo")
    || typeof preset.id !== "string" || !preset.id.startsWith(`${preset.act}.`)
    || typeof preset.name !== "string" || !preset.name.trim()
    || (preset.imageAssetId !== undefined && (typeof preset.imageAssetId !== "string" || !preset.imageAssetId.trim()))
    || typeof preset.publicDescription !== "string" || typeof preset.gmContext !== "string"
    || !isPointOfInterestInformationList(preset.information)) throw new Error("Preset de POI inválido.");
  for (const value of preset.information) {
    const entry = record(value)!;
    const availability = record(entry.availability);
    if (!keysAre(entry, ["id", "content", "approaches", "availability"])
      || !availability || !keysAre(availability, ["mode", "condition"])
      || !(entry.content as string).trim()
      || (entry.approaches as unknown[]).some(value => {
        const approach = record(value);
        const override = record(approach?.difficultyOverride);
        return !approach || !keysAre(approach, ["skill", "difficulty", "showDifficultyToPlayers",
          ...(approach.skill === "aptitude" ? ["specialization"] : []),
          ...(approach.difficultyOverride === undefined ? [] : ["difficultyOverride"])])
          || (approach.difficultyOverride !== undefined && (!override || !keysAre(override, ["difficulty", "condition"])))
          || approach.showDifficultyToPlayers !== false;
      })) throw new Error(`Informação inválida no POI ${preset.id}.`);
  }
}

export function validateAdventurePoiReferences(definition: AdventureDefinition, presets: readonly unknown[],
  acts: readonly AdventureAct[] = ["actOne", "actTwo"]): asserts presets is readonly AdventurePoiPreset[] {
  for (const preset of presets) validateAdventurePoiData(preset);
  const catalog = presets as readonly AdventurePoiPreset[];
  const ids = new Set(catalog.filter(preset => acts.includes(preset.act)).map(preset => preset.id));
  const references = definition.pointsOfInterest.filter(ref => acts.some(act => ref.presetId.startsWith(`${act}.`)))
    .map(ref => ref.presetId);
  if (new Set(catalog.map(preset => preset.id)).size !== catalog.length || new Set(references).size !== references.length
    || ids.size !== references.length || references.some(id => !ids.has(id))) {
    throw new Error("Referências de POI ausentes ou duplicadas.");
  }
  for (const preset of catalog) {
    if (!preset.imageAssetId) continue;
    const matches = definition.assets.filter(asset => asset.id === preset.imageAssetId);
    const asset = matches[0];
    if (matches.length !== 1 || asset.source.act !== preset.act || asset.kind === "music"
      || !/\.(?:apng|avif|bmp|gif|jpe?g|png|svg|tiff|webp)$/i.test(asset.source.originalEntryPath)) {
      throw new Error(`Imagem de POI inválida: ${preset.id} → ${preset.imageAssetId}.`);
    }
  }
}

export function poiSystem(preset: AdventurePoiPreset): PointOfInterestSystemData {
  return { publicDescription: preset.publicDescription, gmContext: preset.gmContext, information: preset.information };
}
