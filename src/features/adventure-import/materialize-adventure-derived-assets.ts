import type { AdventureAssetStorage } from "../../adapters/foundry/adventure-asset-storage";
import type { AdventureImageCropPort } from "../../adapters/files/adventure-image-crop";
import type { AdventureDefinition } from "../../core/adventure-import/adventure-definition";
import { validateAdventureImageCrops } from "../../core/adventure-import/adventure-image-crop";
import type { AdventureScenePreset } from "../../core/adventure-import/adventure-scene-data";
import { adventureDerivedAssetLocation } from "./adventure-asset-layout";
import type { MaterializationResult } from "./materialize-adventure-assets";
import { resolveAdventureAsset } from "./resolve-adventure-asset";

export type DerivedAssetStatus =
  | { readonly status: "available"; readonly path: string }
  | { readonly status: "absent" }
  | { readonly status: "failed"; readonly reason: "lookup" | "generation"; readonly error: unknown };
export type DerivedAssetResult = Readonly<Record<string, DerivedAssetStatus>>;

export interface MaterializeAdventureDerivedAssetsInput {
  readonly definition: AdventureDefinition;
  readonly presets: readonly AdventureScenePreset[];
  readonly materialization: MaterializationResult;
  readonly storage: AdventureAssetStorage;
  readonly images: AdventureImageCropPort;
}

export async function materializeAdventureDerivedAssets(input: MaterializeAdventureDerivedAssetsInput): Promise<DerivedAssetResult> {
  const { definition, presets, materialization, storage, images } = input;
  validateAdventureImageCrops(definition, presets);
  const selected = presets.filter(preset => materialization.materializedActs.includes(preset.act));
  const requested = new Set(selected.flatMap(preset => preset.tiles.flatMap(tile =>
    tile.textureAsset.kind === "derived" ? [tile.textureAsset.assetId] : [])));
  const result: Record<string, DerivedAssetStatus> = {};
  for (const id of requested) {
    const recipe = definition.imageCrops!.find(candidate => candidate.id === id)!;
    const { directory, basename } = adventureDerivedAssetLocation(storage.worldId, recipe.consumerAct, recipe.basename);
    let existing: string | null;
    try {
      existing = await storage.findExisting(directory, basename);
      if (existing && await images.inspect(existing, recipe.target.width, recipe.target.height) === "valid") {
        result[id] = { status: "available", path: existing };
        continue;
      }
    } catch (error) {
      result[id] = { status: "failed", reason: "lookup", error };
      continue;
    }
    const source = definition.assets.find(asset => asset.id === recipe.sourceAssetId)!;
    if (!materialization.materializedActs.includes(source.source.act)) {
      result[id] = { status: "absent" };
      continue;
    }
    try {
      const sourcePath = await resolveAdventureAsset(definition, recipe.sourceAssetId, { kind: "materialization", result: materialization });
      const png = await images.crop(sourcePath, recipe);
      const path = await storage.uploadAndConfirm(directory, new File([png], basename, { type: recipe.target.mimeType }));
      if (await images.inspect(path, recipe.target.width, recipe.target.height) !== "valid") throw new Error("Crop persistido inválido.");
      result[id] = { status: "available", path };
    } catch (error) {
      result[id] = { status: "failed", reason: "generation", error };
    }
  }
  return result;
}
