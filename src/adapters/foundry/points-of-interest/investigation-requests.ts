import { createCheckRequest } from "../../../features/checks/create-check-request";
import { SYSTEM_ID } from "../../../config/system-config";
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";
import { investigationParticipants, recordInvestigationActionSuccess, sceneInvestigationRuntime } from "./investigation-runtime";
import { requestShareCandidates, transferShareClue, type ShareClueReference } from "./investigation-share";
import { openCreateInvestigationClueDialog } from "../../../applications/points-of-interest/investigation-clue-dialog";
import type { CheckRequestMessageLifecycle } from "../chat/read-check-request-message";
import { serializePoiItemMutation } from "./poi-runtime-queries";

export const INVESTIGATION_REQUEST_FLAG = "investigationRequest";
export const INVESTIGATION_CHECK_FLAG = "investigationCheck";
const REQUEST_QUERY = `${SYSTEM_ID}.investigationRequest`;
const DECISION_QUERY = `${SYSTEM_ID}.investigationRequestDecision`;
const ROOT = "ORDEMPARANORMAL2.PointOfInterest.InvestigationControl";

export interface InvestigationRequestState {
  readonly schemaVersion: 1;
  readonly kind: "recap" | "share";
  readonly status: "pending" | "approved" | "declined";
  readonly sceneId: string;
  readonly runId: string;
  readonly actorUuid: string;
  readonly text?: string;
  readonly receiverActorUuid?: string;
  readonly clue?: ShareClueReference;
  readonly clueText?: string;
  readonly senderName?: string;
  readonly senderImg?: string;
  readonly receiverName?: string;
  readonly checkMessageId?: string;
}
export type InvestigationRequestInput =
  | { readonly kind: "recap"; readonly sceneId: string; readonly runId: string; readonly actorUuid: string; readonly text: string }
  | { readonly kind: "share"; readonly sceneId: string; readonly runId: string; readonly actorUuid: string;
      readonly receiverActorUuid: string; readonly clue: ShareClueReference };
export type InvestigationRequestResult = { readonly ok: true } |
  { readonly ok: false; readonly reason: "invalid" | "forbidden" | "unavailable" | "stale" };

export function readInvestigationRequest(message: ChatMessage): InvestigationRequestState | null {
  const raw = message.getFlag(SYSTEM_ID, INVESTIGATION_REQUEST_FLAG);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const state = raw as Record<string, unknown>;
  if (state.schemaVersion !== 1 || (state.kind !== "recap" && state.kind !== "share")
    || !["pending", "approved", "declined"].includes(String(state.status))
    || typeof state.sceneId !== "string" || typeof state.runId !== "string"
    || typeof state.actorUuid !== "string" || !/^Actor\.[^.]+$/u.test(state.actorUuid)
    || state.kind === "share" && (typeof state.receiverActorUuid !== "string"
      || !/^Actor\.[^.]+$/u.test(state.receiverActorUuid) || typeof state.clueText !== "string")) return null;
  return state as unknown as InvestigationRequestState;
}

export function isShareCheckCurrentlyAuthorized(message: ChatMessage): boolean {
  const state = readInvestigationRequest(message);
  if (!state || state.kind !== "share" || state.status !== "approved") return true;
  const scene = game.scenes.get(state.sceneId);
  const runtime = scene ? sceneInvestigationRuntime(scene) : null;
  return !!runtime && runtime.runId === state.runId && !runtime.shareSuccessActorUuid
    && investigationParticipants(scene!).some(actor => actor.uuid === state.receiverActorUuid);
}

async function renderRequest(state: InvestigationRequestState, actorName: string, receiverName = ""): Promise<string> {
  await ensureSharedPartialsLoaded();
  return foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/investigation-request-card.hbs`,
    { title: game.i18n.localize(`${ROOT}.${state.kind === "recap" ? "Recap" : "Share"}`),
      actorName, receiverName, text: state.text ?? "", pending: state.status === "pending",
      status: game.i18n.localize(`${ROOT}.${state.status === "pending" ? "Pending" : state.status === "approved" ? "Approved" : "Declined"}`) },
  );
}

export async function renderInvestigationShareContent(
  state: InvestigationRequestState, lifecycle: CheckRequestMessageLifecycle,
): Promise<string> {
  await ensureSharedPartialsLoaded();
  const snapshot = "snapshot" in lifecycle ? lifecycle.snapshot : null;
  return foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/investigation-share-card.hbs`,
    { title: game.i18n.localize(`${ROOT}.Share`), senderName: state.senderName ?? "",
      receiverName: state.receiverName ?? "", clueText: state.clueText ?? "",
      pending: !snapshot, resolved: !!snapshot, success: snapshot?.outcome === "success",
      total: snapshot?.total, resultLabel: snapshot
        ? game.i18n.localize(`${ROOT}.${snapshot.outcome === "success" ? "Success" : "Failure"}`) : "" },
  );
}

async function createActionCheck(state: InvestigationRequestState, request: ChatMessage): Promise<void> {
  const actorUuid = state.kind === "recap" ? state.actorUuid : state.receiverActorUuid;
  if (!actorUuid || !/^Actor\.[^.]+$/u.test(actorUuid)) throw new Error("Invalid Check Request actor.");
  const check = await createCheckRequest({ participant: { kind: "actor", uuid: actorUuid as `Actor.${string}` },
    selection: { kind: "skill", key: state.kind === "recap" ? "intuition" : "research" }, difficulty: 10 });
  if (!check.id) throw new Error("Check Request message was not created.");
  const next = { ...state, status: "approved" as const, checkMessageId: check.id };
  const sender = game.actors.get(state.actorUuid.slice(6));
  if (!sender) throw new Error("Investigation sender is no longer available.");
  const receiver = state.receiverActorUuid ? game.actors.get(state.receiverActorUuid.slice(6)) : null;
  await request.update({ content: await renderRequest(next, sender.name, receiver?.name ?? ""),
    [`flags.${SYSTEM_ID}.${INVESTIGATION_REQUEST_FLAG}`]: next });
  await check.update({ [`flags.${SYSTEM_ID}.${INVESTIGATION_CHECK_FLAG}`]: {
    schemaVersion: 1, kind: state.kind, sceneId: state.sceneId, runId: state.runId,
    actorUuid: state.actorUuid, checkActorUuid: actorUuid, requestMessageId: request.id,
  } });
}

export async function resolveInvestigationRequest(
  input: InvestigationRequestInput, requester: foundry.documents.User,
): Promise<InvestigationRequestResult> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id
    || (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(requester.id) !== requester)
    return { ok: false, reason: "forbidden" };
  if (!input || typeof input.sceneId !== "string" || typeof input.runId !== "string"
    || typeof input.actorUuid !== "string" || (input.kind !== "recap" && input.kind !== "share"))
    return { ok: false, reason: "invalid" };
  const scene = game.scenes.get(input.sceneId);
  const runtime = scene ? sceneInvestigationRuntime(scene) : null;
  if (!scene || !runtime || runtime.runId !== input.runId) return { ok: false, reason: "stale" };
  if (input.kind === "recap" && runtime.recapSuccessActorUuid || input.kind === "share" && runtime.shareSuccessActorUuid)
    return { ok: false, reason: "stale" };
  const actor = /^Actor\.[^.]+$/u.test(input.actorUuid) ? game.actors.get(input.actorUuid.slice(6)) : null;
  if (!actor || !investigationParticipants(scene).some(agent => agent.uuid === actor.uuid)
    || !requester.isGM && !actor.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    return { ok: false, reason: "forbidden" };
  let state: InvestigationRequestState;
  let receiverName = "";
  if (input.kind === "recap") {
    if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000)
      return { ok: false, reason: "invalid" };
    state = { schemaVersion: 1, kind: "recap", status: "pending", sceneId: scene.id!, runId: runtime.runId,
      actorUuid: actor.uuid, text: input.text.trim() };
  } else {
    const receiver = /^Actor\.[^.]+$/u.test(input.receiverActorUuid) ? game.actors.get(input.receiverActorUuid.slice(6)) : null;
    if (!receiver || receiver.uuid === actor.uuid || !investigationParticipants(scene).some(agent => agent.uuid === receiver.uuid))
      return { ok: false, reason: "invalid" };
    const candidates = await requestShareCandidates(scene.id!, runtime.runId, actor.uuid);
    const selected = candidates.find(candidate => JSON.stringify(candidate.reference) === JSON.stringify(input.clue));
    if (!selected)
      return { ok: false, reason: "invalid" };
    if (!await transferShareClue(scene, runtime.runId, actor.uuid, receiver.uuid, input.clue))
      return { ok: false, reason: "unavailable" };
    receiverName = receiver.name;
    state = { schemaVersion: 1, kind: "share", status: "approved", sceneId: scene.id!, runId: runtime.runId,
      actorUuid: actor.uuid, receiverActorUuid: receiver.uuid, clue: input.clue,
      clueText: selected.text, senderName: actor.name, senderImg: actor.img ?? "", receiverName: receiver.name };
  }
  const gmIds = (game.users as unknown as { contents: foundry.documents.User[] }).contents
    .filter(user => user.isGM && user.active).map(user => user.id);
  if (state.kind === "share") {
    const receiverUuid = state.receiverActorUuid;
    if (!receiverUuid) return { ok: false, reason: "invalid" };
    const involved = (game.users as unknown as { contents: foundry.documents.User[] }).contents
      .filter(user => user.isGM
        || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
        || game.actors.get(receiverUuid.slice(6))?.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
      .map(user => user.id);
    await createCheckRequest({ participant: { kind: "actor", uuid: receiverUuid as `Actor.${string}` },
      selection: { kind: "skill", key: "research" }, difficulty: 10 },
    { whisper: involved, speakerActor: actor, systemFlags: { [INVESTIGATION_REQUEST_FLAG]: state } });
    return { ok: true };
  }
  const message = await ChatMessage.create({
    content: await renderRequest(state, actor.name, receiverName),
    whisper: [...new Set([...gmIds, requester.id])], speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { [INVESTIGATION_REQUEST_FLAG]: state } },
  });
  if (!message) return { ok: false, reason: "unavailable" };
  return { ok: true };
}

export async function requestInvestigationAction(input: InvestigationRequestInput): Promise<InvestigationRequestResult> {
  const active = game.users.activeGM;
  if (!active) return { ok: false, reason: "unavailable" };
  try {
    return active.id === game.user?.id
      ? await (input.kind === "share"
        ? serializePoiItemMutation(`investigation-share:${input.sceneId}`, () => resolveInvestigationRequest(input, game.user))
        : resolveInvestigationRequest(input, game.user))
      : await active.query(REQUEST_QUERY, input, { timeout: 10000 }) as InvestigationRequestResult;
  }
  catch { return { ok: false, reason: "unavailable" }; }
}

export async function decideInvestigationRequest(messageId: string, approved: boolean, requester: foundry.documents.User): Promise<boolean> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id || !requester.isGM) return false;
  const message = (game as typeof game & { messages?: { get(id: string): ChatMessage | undefined } }).messages?.get(messageId);
  const state = message ? readInvestigationRequest(message) : null;
  if (!message || !state || state.kind !== "recap" || state.status !== "pending") return false;
  const scene = game.scenes.get(state.sceneId);
  const runtime = scene ? sceneInvestigationRuntime(scene) : null;
  if (!runtime || runtime.runId !== state.runId || runtime.recapSuccessActorUuid) return false;
  const actor = game.actors.get(state.actorUuid.slice(6));
  if (!actor) return false;
  if (approved) {
    await createActionCheck(state, message);
    return true;
  }
  const next: InvestigationRequestState = { ...state, status: "declined" };
  await message.update({ content: await renderRequest(next, actor.name),
    [`flags.${SYSTEM_ID}.${INVESTIGATION_REQUEST_FLAG}`]: next });
  return true;
}

export async function dispatchInvestigationDecision(messageId: string, approved: boolean): Promise<boolean> {
  const active = game.users.activeGM;
  if (!game.user?.isGM || !active) return false;
  if (active.id === game.user.id) return decideInvestigationRequest(messageId, approved, game.user);
  return active.query(DECISION_QUERY, { messageId, approved }, { timeout: 10000 }) as Promise<boolean>;
}

export async function onInvestigationCheckMessageUpdated(message: ChatMessage): Promise<void> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return;
  const direct = readInvestigationRequest(message);
  if (direct?.kind === "share") {
    const lifecycle = (await import("../chat/read-check-request-message")).readCheckRequestMessageLifecycle(message);
    if (!lifecycle || !("snapshot" in lifecycle) || lifecycle.snapshot.difficulty !== 10
      || lifecycle.snapshot.outcome !== "success" || lifecycle.state.participant.kind !== "actor"
      || lifecycle.state.participant.uuid !== direct.receiverActorUuid || lifecycle.state.selection.key !== "research") return;
    const recorded = await recordInvestigationActionSuccess(direct.sceneId, direct.runId, direct.actorUuid, "share");
    if (recorded) {
      ui.notifications.info(game.i18n.localize(`${ROOT}.ChooseClue`));
      try { await openCreateInvestigationClueDialog(direct.sceneId, direct.runId); }
      catch (error) { console.error(`${SYSTEM_ID} | Failed to open clue dialog`, error); }
    }
    return;
  }
  const raw = message.getFlag(SYSTEM_ID, INVESTIGATION_CHECK_FLAG);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const state = raw as Record<string, unknown>;
  if (state.schemaVersion !== 1 || (state.kind !== "recap" && state.kind !== "share")
    || typeof state.sceneId !== "string" || typeof state.runId !== "string" || typeof state.actorUuid !== "string"
    || typeof state.checkActorUuid !== "string" || typeof state.requestMessageId !== "string") return;
  const request = (game as typeof game & { messages?: { get(id: string): ChatMessage | undefined } }).messages?.get(state.requestMessageId);
  const original = request ? readInvestigationRequest(request) : null;
  if (!original || original.status !== "approved" || original.checkMessageId !== message.id
    || original.kind !== state.kind || original.sceneId !== state.sceneId || original.runId !== state.runId
    || original.actorUuid !== state.actorUuid
    || (original.kind === "share" ? original.receiverActorUuid : original.actorUuid) !== state.checkActorUuid) return;
  const lifecycle = (await import("../chat/read-check-request-message")).readCheckRequestMessageLifecycle(message);
  if (!lifecycle || !("snapshot" in lifecycle) || lifecycle.snapshot.difficulty !== 10
    || lifecycle.snapshot.outcome !== "success"
    || lifecycle.state.participant.kind !== "actor" || lifecycle.state.participant.uuid !== state.checkActorUuid
    || lifecycle.state.selection.key !== (state.kind === "recap" ? "intuition" : "research")) return;
  const recorded = await recordInvestigationActionSuccess(state.sceneId, state.runId, state.actorUuid, state.kind);
  if (recorded) {
    ui.notifications.info(game.i18n.localize(`${ROOT}.ChooseClue`));
    try { await openCreateInvestigationClueDialog(state.sceneId, state.runId); }
    catch (error) { console.error(`${SYSTEM_ID} | Failed to open clue dialog`, error); }
  }
}

export function registerInvestigationRequestQueries(): void {
  const queries = (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries;
  queries[REQUEST_QUERY] = (input: InvestigationRequestInput, context: { user: foundry.documents.User }) =>
    input?.kind === "share"
      ? serializePoiItemMutation(`investigation-share:${String(input.sceneId)}`, () => resolveInvestigationRequest(input, context.user))
      : resolveInvestigationRequest(input, context.user);
  queries[DECISION_QUERY] = (data: { messageId?: unknown; approved?: unknown }, context: { user: foundry.documents.User }) =>
    typeof data?.messageId === "string" && typeof data.approved === "boolean"
      ? decideInvestigationRequest(data.messageId, data.approved, context.user) : false;
}
