import { buildTileInteractionFlagUpdate } from "./tile-interactions/tile-interaction-config";
import { adventureDataRecord as record } from "../../core/adventure-import/adventure-agent-data";
import { importFlag, stableSerialize, type AgentActorSource } from "../../core/adventure-import/adventure-agent-reconciliation";
import {
  SCENE_COLLECTIONS, SCENE_IMPORT_FLAG_PATH, sceneConfigurationProjection, sceneManagedUpdate,
  sceneEmbeddedProjection,
  type AdventureSceneSource, type SceneEmbeddedSource, type SceneEmbeddedChange, type SceneImportFlag,
} from "../../core/adventure-import/adventure-scene-reconciliation";
import type { AdventureScenePort } from "../../features/adventure-import/prepare-adventure-scenes";
import { ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH, type AdventureFolderPlacementFlag } from "../../features/adventure-import/adventure-folders";

// Public v14 Levels and Scene fields are incomplete in the installed declarations.
interface NativeScene {
  readonly id: string | null;
  toObject(): AdventureSceneSource;
  validate(options: { strict: boolean }): boolean;
  update(data: Record<string, unknown>): Promise<unknown>;
}
interface NativeSceneConstructor {
  new(data: Record<string, unknown>, options?: { strict: boolean }): NativeScene;
  create(data: Record<string, unknown>, options: { keepEmbeddedIds: boolean; renderSheet: boolean }): Promise<NativeScene | undefined>;
}
interface SceneWriteOperation {
  readonly action: "create" | "update" | "delete";
  readonly documentName: string;
  readonly data?: readonly Record<string, unknown>[];
  readonly updates?: readonly Record<string, unknown>[];
  readonly ids?: readonly string[];
  readonly parent?: NativeScene;
  readonly keepId?: boolean;
}

export function createAdventureScenePort(): AdventureScenePort {
  const Scene = foundry.documents.Scene.implementation as unknown as NativeSceneConstructor;
  const authorized = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;
  function guard(): void { if (!authorized()) throw new Error("Somente o GM ativo pode importar Scenes."); }
  function sceneById(id: string): NativeScene {
    const scene = game.scenes.get(id);
    if (!scene) throw new Error("Scene importada não encontrada.");
    return scene as unknown as NativeScene;
  }
  function flagUpdate(flag: SceneImportFlag): Record<string, unknown> {
    return { [SCENE_IMPORT_FLAG_PATH]: foundry.data.operators.ForcedReplacement.create(structuredClone(flag)) };
  }
  return {
    isAuthorized: authorized,
    listScenes: () => game.scenes.contents.map((s: foundry.documents.Scene) => s.toObject() as unknown as AdventureSceneSource),
    listActors: () => game.actors.contents.map((a: foundry.documents.Actor) => a.toObject() as unknown as AgentActorSource),
    async confirmAsset(path) {
      const slash = path.lastIndexOf("/");
      if (slash < 0) throw new Error("Path de asset inválido.");
      const listing = await foundry.applications.apps.FilePicker.browse("data", path.slice(0, slash));
      const normalize = (p: string) => p.split("/").map(decodeURIComponent).join("/").normalize("NFC");
      if (!listing.files.some(p => normalize(p) === normalize(path))) throw new Error(`Asset de Scene indisponível: ${path}`);
    },
    async prepareToken(actorId, preset, texture, levelId) {
      const actor = game.actors.get(actorId);
      if (!actor) throw new Error("Actor de Token não encontrado.");
      const token = await actor.getTokenDocument({ ...structuredClone(preset.configuration), ...preset.initial,
        texture: { ...preset.configuration.texture, src: texture }, actorId, actorLink: true, level: levelId } as unknown as Parameters<typeof actor.getTokenDocument>[0]);
      const source = (token as unknown as { toObject(): SceneEmbeddedSource }).toObject();
      for (const key of ["_stats", "_movementHistory", "_regions", "delta", "flags"]) delete source[key];
      return { ...source, _id: preset.id, actorId, actorLink: true, texture: { ...record(source.texture), src: texture } };
    },
    validateCandidate(source) {
      const data = structuredClone(source);
      if (!data._id) delete (data as Record<string, unknown>)._id;
      const draft = new Scene(data, { strict: true });
      if (!draft.validate({ strict: true })) throw new Error("Dados de Scene inválidos no Foundry v14.");
      const actual = draft.toObject();
      if (stableSerialize(sceneConfigurationProjection(actual)) !== stableSerialize(sceneConfigurationProjection(source))) throw new Error("O modelo v14 alterou a configuração preparada da Scene.");
      for (const [type, collection] of Object.entries(SCENE_COLLECTIONS)) {
        if (source[collection].some(target => !actual[collection].some(s => s._id === target._id))) throw new Error(`IDs de ${type} não preservados na validação.`);
        for (const target of source[collection]) if (importFlag(target)?.importer === "sceneEmbedded") {
          const persisted = actual[collection].find(s => s._id === target._id)!;
          if (stableSerialize(sceneEmbeddedProjection(type as keyof typeof SCENE_COLLECTIONS, target)) !== stableSerialize(sceneEmbeddedProjection(type as keyof typeof SCENE_COLLECTIONS, persisted))) throw new Error(`O modelo v14 alterou os dados preparados de ${type}: ${target._id}`);
        }
      }
    },
    async createScene(source, folder, folderPlacement: AdventureFolderPlacementFlag) {
      guard();
      const data: Record<string, unknown> = structuredClone(source);
      delete data._id;
      data.folder = folder;
      const flags = record(data.flags) ?? {};
      data.flags = { ...flags, ordemparanormal2: { ...record(flags.ordemparanormal2), adventureImportFolder: folderPlacement } };
      const result = await Scene.create(data, { keepEmbeddedIds: true, renderSheet: false });
      const persisted = result?.toObject();
      const persistedScope = persisted ? record(persisted.flags?.ordemparanormal2) : null;
      if (!result?.id || !persisted || stableSerialize(importFlag(persisted)) !== stableSerialize(importFlag(source))
        || persisted.folder !== folder || stableSerialize(persistedScope?.adventureImportFolder) !== stableSerialize(folderPlacement)) {
        throw new Error("Criação de Scene não confirmada.");
      }
      return result.id;
    },
    async updateFolderPlacement(id, folder, flag) {
      guard();
      const scene = sceneById(id);
      await scene.update({ folder, [ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH]: flag });
      const persisted = scene.toObject();
      const scope = record(persisted.flags?.ordemparanormal2);
      if ((persisted.folder ?? null) !== folder || stableSerialize(scope?.adventureImportFolder) !== stableSerialize(flag)) {
        throw new Error("Organização da Scene não confirmada.");
      }
    },
    async markIncomplete(id, flag) {
      guard(); await sceneById(id).update(flagUpdate(flag));
      if (stableSerialize(importFlag(sceneById(id).toObject())) !== stableSerialize(flag)) throw new Error("Provenance incompleta de Scene não confirmada.");
    },
    async applyChanges(id, desired, changes: readonly SceneEmbeddedChange[]) {
      guard();
      const scene = sceneById(id);
      const configuration = sceneConfigurationProjection(desired);
      const { fog, ...fields } = configuration;
      const operations: SceneWriteOperation[] = [{ action: "update", documentName: "Scene", updates: [{ _id: id, ...fields,
        "fog.mode": record(fog)?.mode, "fog.colors": record(fog)?.colors }] }];
      for (const change of changes) {
        if (change.creates.length) operations.push({ action: "create", documentName: change.type, data: change.creates, parent: scene, keepId: true });
        if (change.updates.length) operations.push({ action: "update", documentName: change.type,
          updates: change.updates.map(source => {
            const update = sceneManagedUpdate(change.type, source);
            update[SCENE_IMPORT_FLAG_PATH] = foundry.data.operators.ForcedReplacement.create(update[SCENE_IMPORT_FLAG_PATH]);
            if (change.type === "Tile") Object.assign(update, buildTileInteractionFlagUpdate(record(record(source.flags?.ordemparanormal2)?.tileInteraction) as unknown as Parameters<typeof buildTileInteractionFlagUpdate>[0]));
            return update;
          }), parent: scene });
      }
      for (const change of [...changes].reverse()) if (change.deletes.length) operations.push({ action: "delete", documentName: change.type, ids: change.deletes, parent: scene });
      await (foundry.documents as unknown as FoundryDocumentsWithModifyBatch).modifyBatch(operations);
    },
    async completeScene(id, flag) {
      guard(); await sceneById(id).update(flagUpdate(flag));
    },
  };
}
