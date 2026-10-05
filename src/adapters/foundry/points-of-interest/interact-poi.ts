import { SYSTEM_ID } from "../../../config/system-config";
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";
import { investigationParticipants, sceneInvestigationRuntime } from "./investigation-runtime";
import { isGmControlledPoi, isPoiVisibleTo, readPoiVisibility, readScenePoiUuids, worldPoi } from "./poi-runtime-state";

export const INTERACT_POI_QUERY = `${SYSTEM_ID}.interactPoi`;
export const INTERACTION_FLAG = "investigationInteraction";
export interface InteractPoiInput {
  readonly sceneId: string;
  readonly runId: string;
  readonly itemUuid: string;
  readonly actorUuid: string;
  readonly text: string;
}
export type InteractPoiResult = { readonly ok: true } |
  { readonly ok: false; readonly reason: "invalid" | "forbidden" | "unavailable" | "stale" };

export async function resolveInteractPoi(input: InteractPoiInput, requester: foundry.documents.User): Promise<InteractPoiResult> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id
    || (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(requester.id) !== requester)
    return { ok: false, reason: "forbidden" };
  if (!input || typeof input.sceneId !== "string" || typeof input.runId !== "string"
    || typeof input.itemUuid !== "string" || typeof input.actorUuid !== "string"
    || typeof input.text !== "string" || !input.text.trim() || input.text.length > 2000)
    return { ok: false, reason: "invalid" };
  const scene = game.scenes.get(input.sceneId);
  const item = worldPoi(input.itemUuid);
  if (!scene || !item || !isGmControlledPoi(item) || !readScenePoiUuids(scene).includes(input.itemUuid))
    return { ok: false, reason: "unavailable" };
  if (sceneInvestigationRuntime(scene)?.runId !== input.runId) return { ok: false, reason: "stale" };
  if (!isPoiVisibleTo(readPoiVisibility(item), requester.id, requester.isGM)
    || !investigationParticipants(scene).some(actor => actor.uuid === input.actorUuid))
    return { ok: false, reason: "forbidden" };
  const actor = /^Actor\.[^.]+$/u.test(input.actorUuid) ? game.actors.get(input.actorUuid.slice(6)) : null;
  if (!actor || actor.uuid !== input.actorUuid || !requester.isGM
    && !actor.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    return { ok: false, reason: "forbidden" };
  await ensureSharedPartialsLoaded();
  const content = await foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/investigation-interaction-card.hbs`,
    { title: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.Investigation.Interact"),
      actorName: actor.name, poiName: item.name, text: input.text.trim() },
  );
  const gmIds = (game.users as unknown as { contents: foundry.documents.User[] }).contents
    .filter(user => user.isGM && user.active).map(user => user.id);
  await ChatMessage.create({ content, whisper: gmIds, speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { [INTERACTION_FLAG]: { schemaVersion: 1, sceneId: scene.id,
      runId: input.runId, itemUuid: item.uuid, actorUuid: actor.uuid, text: input.text.trim() } } } });
  return { ok: true };
}

export async function interactPoi(input: InteractPoiInput): Promise<InteractPoiResult> {
  const active = game.users.activeGM;
  if (!active) return { ok: false, reason: "unavailable" };
  if (active.id === game.user?.id) return resolveInteractPoi(input, game.user);
  try { return await active.query(INTERACT_POI_QUERY, input, { timeout: 10000 }) as InteractPoiResult; }
  catch { return { ok: false, reason: "unavailable" }; }
}

export function registerInteractPoiQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[INTERACT_POI_QUERY] =
    (input: InteractPoiInput, context: { user: foundry.documents.User }) => resolveInteractPoi(input, context.user);
}
