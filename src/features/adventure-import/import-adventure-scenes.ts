import { importFlag, stableSerialize } from "../../core/adventure-import/adventure-agent-reconciliation";
import {
  buildSceneBaseline, readSceneImportFlag, relevantSceneState, sceneConfigurationProjection, sceneEmbeddedProjection,
  SCENE_COLLECTIONS, validateSceneStructure,
} from "../../core/adventure-import/adventure-scene-reconciliation";
import { prepareAdventureScenes, sceneActorBindingState, type PrepareAdventureScenesInput, type PreparedAdventureScene } from "./prepare-adventure-scenes";
import { adventureFolderPlacementFlag, ensureAdventureFolder, hasAdventureFolderPlacement, type AdventureFolderPort } from "./adventure-folders";

export type SceneConflictDecision = "preserve" | "restore" | null;
export interface SceneImportCounts { created: number; updated: number; unchanged: number; preserved: number; cancelled: boolean }
export class SceneImportError extends Error {
  constructor(readonly stage: "preflight" | "confirmation" | "folder" | "scene" | "embedded" | "baseline", readonly scene: PreparedAdventureScene | null,
    readonly counts: Readonly<SceneImportCounts>, message: string, options?: ErrorOptions) { super(message, options); this.name = "SceneImportError"; }
}
export interface ImportAdventureScenesInput extends PrepareAdventureScenesInput {
  readonly folders: AdventureFolderPort;
  readonly decide: (scenes: readonly PreparedAdventureScene[]) => Promise<SceneConflictDecision>;
  readonly onProgress?: (completed: number, total: number) => void | Promise<void>;
}
let importing = false;
function placementValue(scene: { readonly flags?: Record<string, unknown> }): unknown {
  const scope = scene.flags?.ordemparanormal2;
  return scope && typeof scope === "object" && !Array.isArray(scope)
    ? (scope as Record<string, unknown>).adventureImportFolder : undefined;
}
export async function importAdventureScenes(input: ImportAdventureScenesInput): Promise<SceneImportCounts> {
  const counts: SceneImportCounts = { created: 0, updated: 0, unchanged: 0, preserved: 0, cancelled: false };
  if (importing) throw new SceneImportError("preflight", null, counts, "Já existe uma importação de Scenes em andamento.");
  importing = true;
  let stage: SceneImportError["stage"] = "preflight", current: PreparedAdventureScene | null = null;
  function authorized(): void { if (!input.scenes.isAuthorized()) throw new Error("O GM ativo mudou. Execute a importação novamente."); }
  function checkBindings(plan: PreparedAdventureScene): void {
    for (const binding of plan.bindings) {
      const matches = input.scenes.listActors().filter(a => {
        const f = importFlag(a); return f?.importer === "actor" && f.adventureId === input.definition.id && f.documentId === binding.presetId;
      });
      if (matches.length !== 1 || matches[0]._id !== binding.actorId || sceneActorBindingState(matches[0]) !== binding.previousState) throw new Error("Um Actor mudou após a preparação. Execute novamente.");
    }
  }
  try {
    const plans = await prepareAdventureScenes(input);
    for (const plan of plans) {
      const scene = plan.sceneId ? input.scenes.listScenes().find(candidate => candidate._id === plan.sceneId) : undefined;
      if (scene) hasAdventureFolderPlacement(placementValue(scene), adventureFolderPlacementFlag({ adventureId: plan.flag.adventureId,
        documentType: "Scene", documentId: plan.flag.documentId, act: plan.preset.act }));
    }
    stage = "confirmation";
    const divergent = plans.filter(p => p.divergent);
    const decision = divergent.length ? await input.decide(divergent) : "restore";
    if (decision === null) return { ...counts, cancelled: true };
    authorized();
    const folderIds = new Map<PreparedAdventureScene["preset"]["act"], string>();
    for (const act of new Set(plans.map(plan => plan.preset.act))) {
      stage = "folder";
      folderIds.set(act, await ensureAdventureFolder({ adventureId: input.definition.id, documentType: "Scene", act, folders: input.folders }));
    }
    for (const plan of plans) {
      current = plan;
      authorized(); checkBindings(plan);
      const matches = input.scenes.listScenes().filter(s => readSceneImportFlag(s, input.definition.id)?.documentId === plan.preset.id);
      const previous = matches[0];
      if (plan.sceneId ? matches.length !== 1 || previous._id !== plan.sceneId || relevantSceneState(previous, plan.flag) !== plan.previousState : matches.length !== 0) throw new Error("A Scene mudou após a preparação. Execute novamente.");
      const placement = adventureFolderPlacementFlag({ adventureId: plan.flag.adventureId, documentType: "Scene",
        documentId: plan.flag.documentId, act: plan.preset.act });
      if (previous && !hasAdventureFolderPlacement(placementValue(previous), placement)) {
        stage = "folder"; authorized();
        const legacyFolder = readSceneImportFlag(previous, input.definition.id)?.presetRevision === 1
          && (previous.folder === null || previous.folder === undefined)
          ? folderIds.get(plan.preset.act)! : (typeof previous.folder === "string" ? previous.folder : null);
        await input.scenes.updateFolderPlacement(previous._id, legacyFolder, placement);
      }
      if (plan.divergent && decision === "preserve") counts.preserved++;
      else if (previous && !plan.divergent && readSceneImportFlag(previous, input.definition.id)?.presetRevision === plan.preset.revision
        && stableSerialize(sceneConfigurationProjection(previous)) === stableSerialize(sceneConfigurationProjection(plan.desired))
        && plan.changes.every(c => !c.creates.length && !c.updates.length && !c.deletes.length)) counts.unchanged++;
      else {
        stage = "scene";
        let id = plan.sceneId;
        if (!id) id = await input.scenes.createScene(plan.desired, folderIds.get(plan.preset.act)!, placement);
        else {
          await input.scenes.markIncomplete(id, plan.flag);
          stage = "embedded"; authorized(); checkBindings(plan);
          const fresh = input.scenes.listScenes().find(s => s._id === id);
          if (!fresh || relevantSceneState(fresh, plan.flag) !== relevantSceneState({ ...previous, flags: { ...previous.flags,
            ordemparanormal2: { ...(previous.flags?.ordemparanormal2 as Record<string, unknown>), adventureImport: plan.flag } } }, plan.flag)) throw new Error("A Scene mudou antes da aplicação. Execute novamente.");
          await input.scenes.applyChanges(id, plan.desired, plan.changes);
        }
        const persisted = input.scenes.listScenes().find(s => s._id === id);
        if (!persisted) throw new Error("Scene persistida não encontrada.");
        validateSceneStructure(persisted, plan.flag);
        if (stableSerialize(sceneConfigurationProjection(persisted)) !== stableSerialize(sceneConfigurationProjection(plan.desired))) throw new Error("Configuração persistida da Scene não confirmada.");
        for (const change of plan.changes) {
          const collection = SCENE_COLLECTIONS[change.type];
          for (const target of plan.desired[collection]) {
            const actual = persisted[collection].find(s => s._id === target._id);
            if (!actual || stableSerialize(sceneEmbeddedProjection(change.type, actual)) !== stableSerialize(sceneEmbeddedProjection(change.type, target))) throw new Error(`Dados persistidos de ${change.type} não confirmados: ${target._id}`);
          }
          if (change.deletes.some(id => persisted[collection].some(s => s._id === id))) throw new Error("Remoção embedded não confirmada.");
        }
        if (stableSerialize(importFlag(persisted)) !== stableSerialize(plan.flag)) throw new Error("Provenance persistida da Scene não confirmada.");
        const baseline = await buildSceneBaseline(persisted, plan.flag);
        stage = "baseline"; authorized(); checkBindings(plan);
        const beforeComplete = input.scenes.listScenes().find(s => s._id === id);
        if (!beforeComplete || relevantSceneState(beforeComplete, plan.flag) !== relevantSceneState(persisted, plan.flag)) throw new Error("A Scene mudou antes da conclusão. Execute novamente.");
        const completeFlag = { ...plan.flag, baseline, state: "complete" as const };
        await input.scenes.completeScene(id, completeFlag);
        const complete = input.scenes.listScenes().find(s => s._id === id);
        if (!complete || stableSerialize(importFlag(complete)) !== stableSerialize(completeFlag)) throw new Error("Baseline da Scene não confirmado.");
        if (plan.sceneId) counts.updated++; else counts.created++;
      }
      await input.onProgress?.(counts.created + counts.updated + counts.unchanged + counts.preserved, plans.length);
    }
    return counts;
  } catch (cause) {
    throw new SceneImportError(stage, current, { ...counts }, cause instanceof Error ? cause.message : "Falha na importação de Scenes.", { cause });
  } finally { importing = false; }
}
