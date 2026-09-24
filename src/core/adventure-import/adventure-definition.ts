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
  sources: readonly { readonly presetKey: string; readonly documentId: string; readonly act: AdventureAct; readonly portraitAssetId: string; readonly tokenAssetId: string }[],
  presetKeys: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  const assets = new Map(definition.assets.map(asset => [asset.id, asset]));
  const catalog = new Map(sources.map(source => [source.documentId, source]));
  if (assets.size !== definition.assets.length) issues.push("Duplicate asset IDs");
  if (catalog.size !== sources.length) issues.push("Duplicate source IDs");
  if (new Set(presetKeys).size !== presetKeys.length || new Set(sources.map(source => source.presetKey)).size !== sources.length
    || sources.length !== presetKeys.length || sources.some(source => !presetKeys.includes(source.presetKey))) issues.push("Invalid mechanical preset keys");
  const ids = new Set<string>();
  for (const { presetId } of definition.actors) {
    if (!presetId.trim() || ids.has(presetId)) issues.push(`Duplicate or empty preset reference: ${presetId}`);
    ids.add(presetId);
    const source = catalog.get(presetId);
    if (!source) { issues.push(`Unknown preset: ${presetId}`); continue; }
    for (const [assetId, kind] of [[source.portraitAssetId, "portrait"], [source.tokenAssetId, "token"]] as const) {
      const asset = assets.get(assetId);
      if (!asset || asset.kind !== kind || asset.source.act !== source.act) issues.push(`Invalid ${kind} reference: ${presetId}`);
    }
  }
  if (ids.size !== sources.length || sources.some(source => !ids.has(source.documentId))) {
    issues.push("Missing actor references");
  }
  return issues;
}
