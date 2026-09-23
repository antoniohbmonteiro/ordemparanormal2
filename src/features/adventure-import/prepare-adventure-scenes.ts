import type { AdventureDefinition } from "../../core/adventure-import/adventure-definition";
import type { AdventureScenePreset, SceneTokenPreset } from "../../core/adventure-import/adventure-scene-data";
import { validateAdventureSceneData } from "../../core/adventure-import/adventure-scene-data";
import { importFlag, stableSerialize, type AgentActorSource } from "../../core/adventure-import/adventure-agent-reconciliation";
import {
  hasSceneDivergence, planSceneEmbeddedChanges, readSceneImportFlag, relevantSceneState, sceneEmbeddedFlag, sceneFlag,
  validateManualSceneDependencies, validateSceneStructure, type AdventureSceneSource, type SceneEmbeddedChange,
  type SceneEmbeddedSource, type SceneEmbeddedType, type SceneImportFlag,
  SCENE_COLLECTIONS, sceneConfigurationProjection, sceneEmbeddedProjection,
} from "../../core/adventure-import/adventure-scene-reconciliation";
import { readAgentImportFlag } from "./prepare-adventure-agents";
import { resolveAdventureAsset } from "./resolve-adventure-asset";
import type { MaterializationResult } from "./materialize-adventure-assets";
import type { AdventureFolderPlacementFlag } from "./adventure-folders";
import { validateAdventureImageCrops } from "../../core/adventure-import/adventure-image-crop";
import type { DerivedAssetResult } from "./materialize-adventure-derived-assets";

export const SCENE_SYSTEM_ASSETS = { gmControlButton: "systems/ordemparanormal2/assets/scene-controls/gm-control-button.png" } as const;
export interface AdventureScenePort {
  isAuthorized(): boolean;
  listScenes(): readonly AdventureSceneSource[];
  listActors(): readonly AgentActorSource[];
  prepareToken(actorId: string, preset: SceneTokenPreset, texture: string, levelId: string): Promise<SceneEmbeddedSource>;
  validateCandidate(source: AdventureSceneSource): void;
  createScene(source: AdventureSceneSource, folder: string, folderPlacement: AdventureFolderPlacementFlag): Promise<string>;
  updateFolderPlacement(id: string, folder: string | null, flag: AdventureFolderPlacementFlag): Promise<void>;
  markIncomplete(id: string, flag: SceneImportFlag): Promise<void>;
  applyChanges(id: string, desired: AdventureSceneSource, changes: readonly SceneEmbeddedChange[]): Promise<void>;
  completeScene(id: string, flag: SceneImportFlag): Promise<void>;
}
export interface SceneActorBinding { readonly presetId: string; readonly actorId: string; readonly previousState: string }
export interface PreparedAdventureScene {
  readonly preset: AdventureScenePreset; readonly flag: SceneImportFlag;
  readonly displayName: string;
  readonly sceneId: string | null; readonly previousState: string | null; readonly divergent: boolean;
  readonly desired: AdventureSceneSource; readonly changes: readonly SceneEmbeddedChange[];
  readonly bindings: readonly SceneActorBinding[];
}
export interface PrepareAdventureScenesInput {
  readonly definition: AdventureDefinition; readonly presets: readonly AdventureScenePreset[];
  readonly materialization: MaterializationResult; readonly scenes: AdventureScenePort;
  readonly derivedAssets?: DerivedAssetResult;
}
export function sceneActorBindingState(actor: AgentActorSource): string {
  return stableSerialize({ type: actor.type, flag: importFlag(actor), prototypeToken: actor.prototypeToken });
}
export function validateAdventureSceneReferences(definition: AdventureDefinition, presets: readonly AdventureScenePreset[]): void {
  validateAdventureImageCrops(definition, presets);
  if (new Set(presets.map(p => p.id)).size !== presets.length || new Set(definition.scenes.map(p => p.presetId)).size !== definition.scenes.length
    || new Set(definition.assets.map(a => a.id)).size !== definition.assets.length) throw new Error("Referências de Scene duplicadas.");
  for (const { presetId } of definition.scenes) {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) throw new Error(`Preset de Scene indisponível: ${presetId}`);
    validateAdventureSceneData(preset);
    const map = definition.assets.find(a => a.id === preset.level.backgroundAssetId);
    if (!map || map.kind !== "map" || map.source.act !== preset.act) throw new Error("Background de Scene inválido.");
    for (const token of preset.tokens) {
      if (!definition.actors.some(a => a.presetId === token.agentPresetId)) throw new Error("Referência de agente inválida.");
    }
    for (const tile of preset.tiles) if (tile.textureAsset.kind === "adventure") {
      const asset = definition.assets.find(a => a.id === tile.textureAsset.assetId);
      if (!asset || asset.source.act !== preset.act || asset.kind === "music") throw new Error("Asset de Tile inválido.");
    }
  }
}
export async function prepareAdventureScenes(input: PrepareAdventureScenesInput): Promise<readonly PreparedAdventureScene[]> {
  const { definition, presets, scenes, materialization } = input;
  if (!scenes.isAuthorized()) throw new Error("Somente o GM ativo pode importar Scenes.");
  const acts = materialization.materializedActs;
  if (!Array.isArray(acts) || !acts.length || new Set(acts).size !== acts.length || acts.some(a => a !== "actOne" && a !== "actTwo")) throw new Error("Scope de materialização inválido.");
  validateAdventureSceneReferences(definition, presets);
  const selected = definition.scenes.map(ref => presets.find(p => p.id === ref.presetId)!).filter(p => acts.includes(p.act));
  const live = scenes.listScenes();
  const result: PreparedAdventureScene[] = [];
  const assets = new Map<string, Promise<string>>();
  function resolve(id: string): Promise<string> {
    if (!assets.has(id)) assets.set(id, resolveAdventureAsset(definition, id, { kind: "materialization", result: materialization }));
    return assets.get(id)!;
  }
  for (const fullPreset of selected) {
    const matches = live.filter(s => readSceneImportFlag(s, definition.id)?.documentId === fullPreset.id);
    if (matches.length > 1) throw new Error("Identidade de Scene duplicada.");
    const previous = matches[0] ?? null;
    const oldFlag = previous ? readSceneImportFlag(previous, definition.id)! : null;
    const derived = fullPreset.tiles.filter(tile => tile.textureAsset.kind === "derived");
    if (previous && derived.some(tile => {
      const status = input.derivedAssets?.[tile.textureAsset.assetId];
      return status?.status === "failed" && status.reason === "lookup";
    })) continue;
    const availableTileIds = new Set(fullPreset.tiles.filter(tile => tile.textureAsset.kind !== "derived"
      || input.derivedAssets?.[tile.textureAsset.assetId]?.status === "available").map(tile => tile.id));
    const preset: AdventureScenePreset = { ...fullPreset, tiles: fullPreset.tiles.filter(tile => availableTileIds.has(tile.id))
      .map(tile => ({ ...tile, interaction: { ...tile.interaction,
        tileIds: tile.interaction.tileIds.filter(id => availableTileIds.has(id)) } })) };
    if (oldFlag && oldFlag.presetRevision > preset.revision) throw new Error("A Scene possui uma revisão mais recente que o preset.");
    const flag = sceneFlag(preset, definition.id, oldFlag?.baseline);
    if (previous) validateSceneStructure(previous, flag);
    const background = await resolve(preset.level.backgroundAssetId);
    function embedded(type: SceneEmbeddedType, id: string, data: Record<string, unknown>): SceneEmbeddedSource {
      return { ...data, _id: id, flags: { ordemparanormal2: { adventureImport: sceneEmbeddedFlag(type, id, flag),
        ...(type === "Tile" ? { tileInteraction: data.interaction } : {}) } } };
    }
    const level = preset.level;
    const { id: levelId, backgroundAssetId: _backgroundAssetId, ...levelData } = level;
    const levels = [embedded("Level", levelId, { ...levelData, background: { ...level.background, src: background } })];
    const walls = preset.walls.map(({ id, initialState, ...data }) => embedded("Wall", id, { ...data, levels: [levelId], ds: initialState }));
    const tiles: SceneEmbeddedSource[] = [];
    for (const { id, textureAsset, initial, interaction, ...data } of preset.tiles) {
      const path = textureAsset.kind === "system" ? SCENE_SYSTEM_ASSETS[textureAsset.assetId]
        : textureAsset.kind === "derived" ? (input.derivedAssets?.[textureAsset.assetId] as { status: "available"; path: string }).path
        : await resolve(textureAsset.assetId);
      const tile = embedded("Tile", id, { ...data, ...initial, levels: [levelId], texture: { ...data.texture, src: path }, interaction });
      delete tile.interaction;
      tiles.push(tile);
    }
    const bindings: SceneActorBinding[] = [];
    const tokens: SceneEmbeddedSource[] = [];
    const actors = scenes.listActors();
    for (const token of preset.tokens) {
      const candidates = actors.filter(a => {
        const f = importFlag(a); return f?.importer === "actor" && f.adventureId === definition.id && f.documentId === token.agentPresetId;
      });
      if (candidates.length !== 1) throw new Error(`Actor indisponível ou ambíguo: ${token.agentPresetId}`);
      const actor = candidates[0];
      const actorFlag = readAgentImportFlag(actor, definition.id);
      if (!actorFlag || actorFlag.state !== "complete" || actorFlag.act !== preset.act) throw new Error(`Actor incompleto: ${token.agentPresetId}`);
      const tokenAsset = definition.assets.find(a => a.id === actorFlag.tokenAssetId);
      if (!tokenAsset || tokenAsset.kind !== "token" || tokenAsset.source.act !== preset.act) throw new Error(`Asset de Token inválido: ${token.agentPresetId}`);
      const texture = await resolve(actorFlag.tokenAssetId);
      const configured = await scenes.prepareToken(actor._id, token, texture, levelId);
      tokens.push(embedded("Token", token.id, configured));
      bindings.push({ presetId: token.agentPresetId, actorId: actor._id, previousState: sceneActorBindingState(actor) });
    }
    const drawings = preset.drawings.map(({ id, initial, ...data }) => embedded("Drawing", id, { ...data, ...initial, levels: [levelId] }));
    const { defaults, ...configuration } = preset.scene;
    const desired: AdventureSceneSource = { _id: previous?._id ?? "", name: preset.name, ...configuration, ...defaults, initialLevel: levelId,
      active: false, folder: null, flags: { ordemparanormal2: { adventureImport: flag } }, levels, walls, tiles, tokens, drawings };
    const changes = planSceneEmbeddedChanges(previous, desired, flag);
    validateManualSceneDependencies(previous, changes, flag);
    // The candidate includes preserved state; execution writes only managed patches.
    const candidate = buildSceneCandidate(previous, desired, changes);
    scenes.validateCandidate(candidate);
    result.push({ preset, flag, displayName: previous?.name ?? preset.name, sceneId: previous?._id ?? null, previousState: previous ? relevantSceneState(previous, flag) : null,
      divergent: previous ? await hasSceneDivergence(previous, oldFlag!) : false, desired, changes, bindings });
  }
  if (!scenes.isAuthorized()) throw new Error("O GM ativo mudou. Execute a importação novamente.");
  return result;
}

export function buildSceneCandidate(previous: AdventureSceneSource | null, desired: AdventureSceneSource, changes: readonly SceneEmbeddedChange[]): AdventureSceneSource {
  if (!previous) return structuredClone(desired);
  const candidate = { ...structuredClone(previous), ...sceneConfigurationProjection(desired) } as AdventureSceneSource;
  candidate.fog = { ...(previous.fog as Record<string, unknown>), ...(candidate.fog as Record<string, unknown>) };
  for (const change of changes) {
    const collection = SCENE_COLLECTIONS[change.type];
    const existing = previous[collection].filter(s => !change.deletes.includes(s._id)).map(s => {
      const target = change.updates.find(t => t._id === s._id);
      if (!target) return structuredClone(s);
      const { flag, interaction, ...data } = sceneEmbeddedProjection(change.type, target);
      return { ...structuredClone(s), ...data, flags: { ...s.flags, ordemparanormal2: {
        ...(s.flags?.ordemparanormal2 as Record<string, unknown>), adventureImport: flag,
        ...(change.type === "Tile" ? { tileInteraction: interaction } : {}),
      } } };
    });
    (candidate as Record<string, unknown>)[collection] = [...existing, ...structuredClone(change.creates)];
  }
  return candidate;
}
