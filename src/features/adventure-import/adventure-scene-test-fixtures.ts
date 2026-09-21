import { vi } from "vitest";
import { PLAYTEST_ALPHA_ADVENTURE } from "../../config/adventure-definitions/playtest-alpha";
import { PLAYTEST_ALPHA_SCENE_PRESETS } from "../../config/adventure-scene-presets/playtest-alpha";
import { PLAYTEST_ALPHA_AGENT_PRESETS } from "../../config/adventure-agent-presets/playtest-alpha";
import { importFlag, type AgentActorSource } from "../../core/adventure-import/adventure-agent-reconciliation";
import { SCENE_COLLECTIONS, type AdventureSceneSource, type SceneEmbeddedSource } from "../../core/adventure-import/adventure-scene-reconciliation";
import { buildSceneCandidate, type AdventureScenePort } from "./prepare-adventure-scenes";
import type { AdventureFolderPort, AdventureFolderSnapshot } from "./adventure-folders";

export function sceneImportFixture() {
  type Mutable<T> = { -readonly [K in keyof T]: T[K] };
  interface MutableScene extends Record<string, unknown> {
    _id: string; name: string; flags?: Record<string, unknown>;
    levels: Mutable<SceneEmbeddedSource>[]; walls: Mutable<SceneEmbeddedSource>[]; tiles: Mutable<SceneEmbeddedSource>[];
    tokens: Mutable<SceneEmbeddedSource>[]; drawings: Mutable<SceneEmbeddedSource>[];
  }
  const world: MutableScene[] = [];
  const actors: Mutable<AgentActorSource>[] = PLAYTEST_ALPHA_AGENT_PRESETS.filter(p => p.act === "actOne").map((p, i) => ({
    _id: `actor-${i}`, name: p.name, type: "agent", system: {}, items: [], prototypeToken: { texture: { src: `token-${i}.png` } },
    flags: { ordemparanormal2: { adventureImport: { importer: "actor", adventureId: "playtest-alpha", documentId: p.id,
      presetId: p.id, presetRevision: 1, version: 1, act: "actOne", edition: "playtest-alpha-v1.1", portraitAssetId: p.portraitAssetId,
      tokenAssetId: p.tokenAssetId, state: "complete", baseline: { digest: "baseline", items: [], manualUuids: [] } } } },
  }));
  const find = (id: string) => world.find(s => s._id === id)!;
  const port: AdventureScenePort = {
    isAuthorized: vi.fn(() => true),
    listScenes: () => structuredClone(world), listActors: () => structuredClone(actors),
    confirmAsset: vi.fn(async () => {}),
    prepareToken: vi.fn(async (actorId, preset, texture, levelId) => ({ _id: preset.id, name: actors.find(a => a._id === actorId)!.name,
      ...structuredClone(preset.configuration), ...preset.initial, actorId, level: levelId, texture: { ...preset.configuration.texture, src: texture } })),
    validateCandidate: vi.fn(),
    createScene: vi.fn(async (source, folder, placement) => { const created = { ...structuredClone(source), _id: "scene-one", folder } as unknown as MutableScene; created.flags = { ...created.flags, ordemparanormal2: { ...created.flags?.ordemparanormal2 as object, adventureImportFolder: placement } }; world.push(created); return "scene-one"; }),
    updateFolderPlacement: vi.fn(async (id, folder, flag) => { const s = find(id); s.folder = folder; s.flags = { ...s.flags, ordemparanormal2: { ...s.flags?.ordemparanormal2 as object, adventureImportFolder: flag } }; }),
    markIncomplete: vi.fn(async (id, flag) => { const s = find(id); s.flags = { ...s.flags, ordemparanormal2: { ...s.flags?.ordemparanormal2 as object, adventureImport: structuredClone(flag) } }; }),
    applyChanges: vi.fn(async (id, desired, changes) => {
      const index = world.findIndex(s => s._id === id);
      world[index] = buildSceneCandidate(find(id) as unknown as AdventureSceneSource, desired, changes) as unknown as MutableScene;
    }),
    completeScene: vi.fn(async (id, flag) => { const s = find(id); s.flags = { ...s.flags, ordemparanormal2: { ...s.flags?.ordemparanormal2 as object, adventureImport: structuredClone(flag) } }; }),
  };
  const folderWorld: AdventureFolderSnapshot[] = [];
  const folders: AdventureFolderPort = {
    isAuthorized: () => true, listFolders: () => folderWorld,
    createFolder: vi.fn(async data => { const id = `Scene-${data.flag.folderId}`; folderWorld.push({ id, name: data.name, color: data.color, type: data.documentType, parentId: data.parentId, flag: data.flag }); return id; }),
    updateFolder: vi.fn(async (id, data) => { const index = folderWorld.findIndex(folder => folder.id === id); folderWorld[index] = { ...folderWorld[index], ...data }; }),
  };
  const input = {
    definition: structuredClone(PLAYTEST_ALPHA_ADVENTURE), presets: structuredClone(PLAYTEST_ALPHA_SCENE_PRESETS), scenes: port,
    materialization: { materializedActs: ["actOne"] as const, assets: PLAYTEST_ALPHA_ADVENTURE.assets.filter(a => a.source.act === "actOne")
      .map(a => ({ act: a.source.act, originalEntryPath: a.source.originalEntryPath, storedPath: `worlds/test/${a.id}.png` })) },
    decide: vi.fn(async (): Promise<"preserve" | "restore" | null> => "restore"), folders,
  };
  const writes = () => [port.createScene, port.updateFolderPlacement, port.markIncomplete, port.applyChanges, port.completeScene];
  const clearWrites = () => writes().forEach(fn => vi.mocked(fn).mockClear());
  return { input, port, actors, world, writes, clearWrites, find, flag: () => importFlag(world[0]), collections: SCENE_COLLECTIONS };
}
