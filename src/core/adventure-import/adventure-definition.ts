import type { ZipPackageId } from "./known-adventure-sources";
import type { AdventureAct } from "./recognize-zip-source";

export type AdventureAssetKind = "map" | "portrait" | "token" | "handout" | "music";

export interface AdventureAssetReference {
  readonly id: string;
  readonly kind: AdventureAssetKind;
  readonly label: string;
  readonly source: {
    readonly act: AdventureAct;
    readonly originalEntryPath: string;
  };
}

export interface AdventureHandoutReference {
  readonly id: string;
  readonly act: AdventureAct;
  readonly assetId: string;
  readonly label: string;
  readonly pageType: "image" | "pdf";
}

export interface AdventureImageCropRecipe {
  readonly id: string;
  readonly consumerAct: AdventureAct;
  readonly sourceAssetId: string;
  readonly revision: number;
  readonly crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly target: { readonly width: number; readonly height: number; readonly mimeType: "image/png" };
  readonly basename: string;
}

export interface AdventureDefinition {
  readonly id: "playtest-alpha";
  readonly packageIds: Readonly<Record<AdventureAct, ZipPackageId>>;
  readonly assets: readonly AdventureAssetReference[];
  readonly handouts: readonly AdventureHandoutReference[];
  readonly imageCrops?: readonly AdventureImageCropRecipe[];
  readonly actors: readonly AdventureAgentReference[];
  readonly scenes: readonly AdventureSceneReference[];
  readonly pointsOfInterest: readonly AdventurePointOfInterestReference[];
}

export interface AdventureAgentReference { readonly presetId: string }
export interface AdventureSceneReference { readonly presetId: string }
export interface AdventurePointOfInterestReference { readonly presetId: string }

export function validateAdventureAgentReferences(
  definition: AdventureDefinition,
  presets: readonly { readonly id: string; readonly act: AdventureAct; readonly portraitAssetId: string; readonly tokenAssetId: string }[],
): readonly string[] {
  const issues: string[] = [];
  const assets = new Map(definition.assets.map(asset => [asset.id, asset]));
  const catalog = new Map(presets.map(preset => [preset.id, preset]));
  if (assets.size !== definition.assets.length) issues.push("Duplicate asset IDs");
  if (catalog.size !== presets.length) issues.push("Duplicate preset IDs");
  const ids = new Set<string>();
  for (const { presetId } of definition.actors) {
    if (!presetId.trim() || ids.has(presetId)) issues.push(`Duplicate or empty preset reference: ${presetId}`);
    ids.add(presetId);
    const preset = catalog.get(presetId);
    if (!preset) { issues.push(`Unknown preset: ${presetId}`); continue; }
    for (const [assetId, kind] of [[preset.portraitAssetId, "portrait"], [preset.tokenAssetId, "token"]] as const) {
      const asset = assets.get(assetId);
      if (!asset || asset.kind !== kind || asset.source.act !== preset.act) issues.push(`Invalid ${kind} reference: ${presetId}`);
    }
  }
  return issues;
}
