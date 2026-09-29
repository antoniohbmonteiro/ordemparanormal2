import { SYSTEM_ID } from "../../../config/system-config";
import { readPointOfInterestInformation } from "../../../documents/item/point-of-interest-data";
import { narrativeCluesForScene, transferNarrativeClue } from "./investigation-clues";
import { investigationParticipants, sceneInvestigationRuntime } from "./investigation-runtime";
import { POI_DISCOVERY_PATH, readPoiDiscoveries } from "./poi-discovery";
import { broadcastPoiInvalidation, serializePoiItemMutation } from "./poi-runtime-queries";
import { POI_KNOWLEDGE_PATH, readPoiKnowledge, readScenePoiUuids, worldPoi } from "./poi-runtime-state";

export type ShareClueReference =
  | { readonly kind: "poi"; readonly itemUuid: string; readonly informationId: string }
  | { readonly kind: "narrative"; readonly clueId: string };
export interface ShareCandidate { readonly reference: ShareClueReference; readonly label: string; readonly text: string }
export const SHARE_CANDIDATES_QUERY = `${SYSTEM_ID}.investigationShareCandidates`;

export function shareCandidates(scene: foundry.documents.Scene, runId: string, actorUuid: string): readonly ShareCandidate[] {
  if (sceneInvestigationRuntime(scene)?.runId !== runId) return [];
  const result: ShareCandidate[] = [];
  for (const itemUuid of readScenePoiUuids(scene)) {
    const item = worldPoi(itemUuid);
    if (!item) continue;
    const known = new Set(readPoiKnowledge(item).find(entry => entry.actorUuid === actorUuid)?.informationIds ?? []);
    const discovered = new Set(readPoiDiscoveries(item)
      .filter(entry => entry.runId === runId && entry.actorUuid === actorUuid && known.has(entry.informationId))
      .map(entry => entry.informationId));
    for (const info of readPointOfInterestInformation(item.system)) {
      if (discovered.has(info.id)) result.push({ reference: { kind: "poi", itemUuid, informationId: info.id },
        label: `${item.name} — ${info.content}`, text: info.content });
    }
  }
  for (const clue of narrativeCluesForScene(scene)) {
    if (clue.runId === runId && clue.knownAgentUuids.includes(actorUuid))
      result.push({ reference: { kind: "narrative", clueId: clue.id }, label: clue.text, text: clue.text });
  }
  return result;
}

export async function transferShareClue(
  scene: foundry.documents.Scene, runId: string, fromActorUuid: string, toActorUuid: string, reference: ShareClueReference,
): Promise<boolean> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id
    || sceneInvestigationRuntime(scene)?.runId !== runId
    || !investigationParticipants(scene).some(actor => actor.uuid === toActorUuid)
    || !shareCandidates(scene, runId, fromActorUuid).some(candidate => JSON.stringify(candidate.reference) === JSON.stringify(reference)))
    return false;
  if (reference.kind === "narrative") {
    const transferred = await transferNarrativeClue(scene, runId, reference.clueId, fromActorUuid, toActorUuid);
    if (transferred) await broadcastPoiInvalidation();
    return transferred;
  }
  return serializePoiItemMutation(reference.itemUuid, async () => {
    const item = worldPoi(reference.itemUuid);
    if (!item || !shareCandidates(scene, runId, fromActorUuid).some(candidate => JSON.stringify(candidate.reference) === JSON.stringify(reference)))
      return false;
    const knowledge = readPoiKnowledge(item).map(entry => ({ actorUuid: entry.actorUuid, informationIds: [...entry.informationIds] }));
    const entry = knowledge.find(candidate => candidate.actorUuid === toActorUuid);
    if (entry?.informationIds.includes(reference.informationId)) return true;
    if (entry) entry.informationIds.push(reference.informationId);
    else knowledge.push({ actorUuid: toActorUuid, informationIds: [reference.informationId] });
    await item.update({
      [POI_KNOWLEDGE_PATH]: foundry.data.operators.ForcedReplacement.create({ agents: knowledge }),
      [POI_DISCOVERY_PATH]: foundry.data.operators.ForcedReplacement.create([
        ...readPoiDiscoveries(item), { runId, actorUuid: toActorUuid, informationId: reference.informationId },
      ]),
    });
    await broadcastPoiInvalidation();
    return true;
  });
}

export async function requestShareCandidates(sceneId: string, runId: string, actorUuid: string): Promise<readonly ShareCandidate[]> {
  const active = game.users.activeGM;
  if (!active) return [];
  if (active.id === game.user?.id) {
    const scene = game.scenes.get(sceneId);
    return scene ? shareCandidates(scene, runId, actorUuid) : [];
  }
  try { return await active.query(SHARE_CANDIDATES_QUERY, { sceneId, runId, actorUuid }, { timeout: 10000 }) as ShareCandidate[]; }
  catch { return []; }
}

export function registerShareCandidatesQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[SHARE_CANDIDATES_QUERY] =
    (input: { sceneId?: unknown; runId?: unknown; actorUuid?: unknown }, context: { user: foundry.documents.User }) => {
      if (typeof input?.sceneId !== "string" || typeof input.runId !== "string" || typeof input.actorUuid !== "string") return [];
      const scene = game.scenes.get(input.sceneId);
      const actor = /^Actor\.[^.]+$/u.test(input.actorUuid) ? game.actors.get(input.actorUuid.slice(6)) : null;
      if (!scene || !actor || !investigationParticipants(scene).some(candidate => candidate.uuid === actor.uuid)
        || !context.user.isGM && !actor.testUserPermission(context.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return [];
      return shareCandidates(scene, input.runId, actor.uuid);
    };
}
