import type { AdventureDefinition, AdventureImageCropRecipe } from "./adventure-definition";
import type { AdventureScenePreset } from "./adventure-scene-data";

export function validateAdventureImageCrops(definition: AdventureDefinition, presets: readonly AdventureScenePreset[]): void {
  const recipes = definition.imageCrops ?? [];
  if (new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) throw new Error("Receitas de crop duplicadas.");
  for (const recipe of recipes) validateRecipe(recipe, definition, presets);
  for (const preset of presets) for (const tile of preset.tiles) if (tile.textureAsset.kind === "derived") {
    const recipe = recipes.find(candidate => candidate.id === tile.textureAsset.assetId);
    if (!recipe || recipe.consumerAct !== preset.act) throw new Error(`Receita de Tile inválida: ${tile.id}`);
  }
}

function validateRecipe(recipe: AdventureImageCropRecipe, definition: AdventureDefinition, presets: readonly AdventureScenePreset[]): void {
  const source = definition.assets.find(asset => asset.id === recipe.sourceAssetId);
  const consumer = presets.find(preset => preset.tiles.some(tile => tile.textureAsset.kind === "derived" && tile.textureAsset.assetId === recipe.id));
  const { x, y, width, height } = recipe.crop;
  const target = recipe.target;
  if (!recipe.id.trim() || !consumer || consumer.act !== recipe.consumerAct || source?.kind !== "map"
    || !Number.isInteger(recipe.revision) || recipe.revision < 1
    || ![x, y, width, height, target.width, target.height].every(Number.isInteger)
    || x < 0 || y < 0 || width <= 0 || height <= 0
    || target.width !== width || target.height !== height || target.mimeType !== "image/png"
    || !/^generated-[a-z0-9-]+-r\d+\.png$/.test(recipe.basename)
    || !recipe.basename.endsWith(`-r${recipe.revision}.png`)) throw new Error(`Receita de crop inválida: ${recipe.id}`);
}
