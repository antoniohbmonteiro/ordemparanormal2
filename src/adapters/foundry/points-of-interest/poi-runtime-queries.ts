import { SYSTEM_ID } from "../../../config/system-config";
import { readPointOfInterestInformation } from "../../../documents/item/point-of-interest-data";
import { publishPoiRevealNotice } from "./publish-poi-reveal-notice";
import { associatedRegionIds, isGmControlledPoi, isPoiVisibleTo, isWorldPoiUuid, POI_KNOWLEDGE_PATH, POI_SCENE_ITEMS_PATH, POI_VISIBILITY_PATH, readPoiKnowledge, readPoiVisibility, readScenePoiUuids, worldPoi } from "./poi-runtime-state";

export const POI_SCENE_QUERY = `${SYSTEM_ID}.poiScene`;
export const POI_MUTATION_QUERY = `${SYSTEM_ID}.poiMutation`;
export const POI_INVALIDATION_QUERY = `${SYSTEM_ID}.poiInvalidate`;

export type PoiMutation =
  | { readonly action: "add" | "remove"; readonly sceneId: string; readonly itemUuid: string }
  | { readonly action: "visibility"; readonly sceneId: string; readonly itemUuid: string;
      readonly mode: "hidden" | "everyone" | "users"; readonly users: readonly string[] }
  | { readonly action: "knowledge"; readonly sceneId: string; readonly itemUuid: string;
      readonly informationId: string; readonly actorUuids: readonly string[] };
export type PoiMutationResult = { readonly ok: true } | { readonly ok: false; readonly reason: "forbidden" | "unavailable" | "linked" | "invalid" | "no-gm" };
export interface PoiSceneEntry { readonly itemUuid: string; readonly name: string; readonly img: string; readonly linkedRegionIds: readonly string[] }
export type PoiSceneResult = { readonly entries: readonly PoiSceneEntry[] } | { readonly error: "unavailable" | "no-gm" };

const listeners = new Set<() => void>();
function users(): foundry.documents.User[] { return (game.users as unknown as { contents: foundry.documents.User[] }).contents; }
function userById(id: string): foundry.documents.User | undefined {
  return (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(id);
}
export function subscribePoiInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function invalidateLocal(): void { for (const listener of listeners) listener(); }
function isActiveGm(): boolean { return !!game.user?.isGM && game.users.activeGM?.id === game.user.id; }

async function broadcast(): Promise<void> {
  invalidateLocal();
  await Promise.allSettled(users()
    .filter(user => user.active && user.id !== game.user.id)
    .map(user => user.query(POI_INVALIDATION_QUERY, {}, { timeout: 3000 })));
}

export function resolvePoiScene(sceneId: string, requester: foundry.documents.User): PoiSceneResult {
  const scene = game.scenes.get(sceneId);
  if (!scene) return { error: "unavailable" };
  const entries: PoiSceneEntry[] = [];
  for (const itemUuid of readScenePoiUuids(scene)) {
    const item = worldPoi(itemUuid);
    if (!item || !isGmControlledPoi(item)) {
      if (requester.isGM) entries.push({ itemUuid, name: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.Canvas.Unavailable"), img: "", linkedRegionIds: associatedRegionIds(scene, itemUuid) });
      continue;
    }
    if (!isPoiVisibleTo(readPoiVisibility(item), requester.id, requester.isGM)) continue;
    entries.push({ itemUuid, name: item.name, img: item.img ?? "", linkedRegionIds: requester.isGM ? associatedRegionIds(scene, itemUuid) : [] });
  }
  return { entries };
}

const queues = new Map<string, Promise<PoiMutationResult>>();
function serialize(key: string, run: () => Promise<PoiMutationResult>): Promise<PoiMutationResult> {
  const previous = queues.get(key);
  const result = (previous ?? Promise.resolve({ ok: true } as PoiMutationResult)).then(run, run);
  queues.set(key, result);
  const cleanup = () => { if (queues.get(key) === result) queues.delete(key); };
  void result.then(cleanup, cleanup);
  return result;
}

async function writeMutation(input: PoiMutation, requester: foundry.documents.User): Promise<PoiMutationResult> {
  if (!isActiveGm() || !requester.isGM || userById(requester.id) !== requester) return { ok: false, reason: "forbidden" };
  if (!input || typeof input.sceneId !== "string" || !isWorldPoiUuid(input.itemUuid)) return { ok: false, reason: "invalid" };
  const scene = game.scenes.get(input.sceneId);
  const item = worldPoi(input.itemUuid);
  if (!scene || input.action !== "remove" && (!item || !isGmControlledPoi(item))) return { ok: false, reason: "unavailable" };
  if (input.action !== "add" && !readScenePoiUuids(scene).includes(input.itemUuid)) return { ok: false, reason: "unavailable" };
  let changed = false;

  if (input.action === "add" || input.action === "remove") {
    const current = readScenePoiUuids(scene);
    if (input.action === "remove" && associatedRegionIds(scene, input.itemUuid).length) return { ok: false, reason: "linked" };
    const next = input.action === "add" ? [...new Set([...current, input.itemUuid])] : current.filter(uuid => uuid !== input.itemUuid);
    if (next.length !== current.length) {
      await scene.update({ [POI_SCENE_ITEMS_PATH]: foundry.data.operators.ForcedReplacement.create(next) });
      changed = true;
    }
  } else if (input.action === "visibility") {
    if (!item) return { ok: false, reason: "unavailable" };
    if (!["hidden", "everyone", "users"].includes(input.mode) || !Array.isArray(input.users)) return { ok: false, reason: "invalid" };
    const players = users().filter(user => !user.isGM);
    const validIds = new Set(players.map(user => user.id));
    if (input.users.some(id => typeof id !== "string" || !validIds.has(id))) return { ok: false, reason: "invalid" };
    const current = readPoiVisibility(item);
    const selectedUsers = input.mode === "users" ? [...new Set(input.users)] : [];
    const authorized = input.mode === "everyone" ? players.map(user => user.id) : selectedUsers;
    const newly = authorized.filter(id => !current.notified.includes(id));
    const next = { mode: input.mode, users: selectedUsers, notified: [...new Set([...current.notified, ...newly])] };
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      await item.update({ [POI_VISIBILITY_PATH]: foundry.data.operators.ForcedReplacement.create(next) });
      changed = true;
      if (newly.length) void publishPoiRevealNotice(newly).catch(error => console.warn(`${SYSTEM_ID} | POI notice failed`, error));
    }
  } else if (input.action === "knowledge") {
    if (!item) return { ok: false, reason: "unavailable" };
    if (typeof input.informationId !== "string" || !Array.isArray(input.actorUuids)) return { ok: false, reason: "invalid" };
    const validIds = new Set(readPointOfInterestInformation(item.system).map(info => info.id));
    if (!validIds.has(input.informationId) || input.actorUuids.some(uuid => typeof uuid !== "string" || !/^Actor\.[^.]+$/u.test(uuid))) return { ok: false, reason: "invalid" };
    const actors = [...new Set(input.actorUuids)].map(uuid => game.actors.get(uuid.slice(6)));
    if (actors.length !== input.actorUuids.length || actors.some(actor => !actor || actor.type !== "agent")) return { ok: false, reason: "invalid" };
    const knowledge = readPoiKnowledge(item).map(entry => ({ actorUuid: entry.actorUuid, informationIds: [...entry.informationIds] }));
    for (const actor of actors) {
      const entry = knowledge.find(value => value.actorUuid === actor!.uuid);
      if (entry) {
        if (!entry.informationIds.includes(input.informationId)) { entry.informationIds.push(input.informationId); changed = true; }
      } else { knowledge.push({ actorUuid: actor!.uuid, informationIds: [input.informationId] }); changed = true; }
    }
    if (changed) await item.update({ [POI_KNOWLEDGE_PATH]: foundry.data.operators.ForcedReplacement.create({ agents: knowledge }) });
  } else return { ok: false, reason: "invalid" };
  if (changed) await broadcast();
  return { ok: true };
}

export function mutatePoi(input: PoiMutation): Promise<PoiMutationResult> {
  const active = game.users.activeGM;
  if (!game.user?.isGM) return Promise.resolve({ ok: false, reason: "forbidden" });
  if (!active) return Promise.resolve({ ok: false, reason: "no-gm" });
  if (active.id === game.user.id) return serialize(input.action === "add" || input.action === "remove" ? input.sceneId : input.itemUuid, () => writeMutation(input, game.user));
  return active.query(POI_MUTATION_QUERY, input, { timeout: 10000 }) as Promise<PoiMutationResult>;
}

export async function requestPoiScene(sceneId: string): Promise<PoiSceneResult> {
  if (game.user?.isGM) return resolvePoiScene(sceneId, game.user);
  const active = game.users.activeGM;
  if (!active) return { error: "no-gm" };
  try { return await active.query(POI_SCENE_QUERY, { sceneId }, { timeout: 10000 }) as PoiSceneResult; }
  catch { return { error: "unavailable" }; }
}

export function registerPoiRuntimeQueries(): void {
  const queries = (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries;
  queries[POI_SCENE_QUERY] = (data: { sceneId?: unknown }, context: { user: foundry.documents.User }) =>
    typeof data?.sceneId === "string" ? resolvePoiScene(data.sceneId, context.user) : { error: "unavailable" };
  queries[POI_MUTATION_QUERY] = (data: PoiMutation, context: { user: foundry.documents.User }) =>
    serialize(data?.action === "add" || data?.action === "remove" ? String(data?.sceneId) : String(data?.itemUuid), () => writeMutation(data, context.user));
  queries[POI_INVALIDATION_QUERY] = (_data: unknown, context: { user: foundry.documents.User }) => {
    if (context.user.id !== game.users.activeGM?.id) return false;
    invalidateLocal(); return true;
  };
}

export async function reconcileScenePoiMembership(): Promise<void> {
  if (!isActiveGm()) return;
  for (const scene of game.scenes) {
    for (const region of scene.regions) {
      const association = region.getFlag(SYSTEM_ID, "pointOfInterest") as { itemUuid?: unknown } | undefined;
      if (typeof association?.itemUuid !== "string" || !worldPoi(association.itemUuid)) continue;
      if (!readScenePoiUuids(scene).includes(association.itemUuid)) {
        const result = await mutatePoi({ action: "add", sceneId: scene.id!, itemUuid: association.itemUuid });
        if (!result.ok) throw new Error(`POI membership reconciliation failed: ${result.reason}`);
      }
    }
  }
}
