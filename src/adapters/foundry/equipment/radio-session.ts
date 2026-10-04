import { SYSTEM_ID } from "../../../config/system-config";
import { readEquipmentUseForms } from "../../../core/equipment/equipment-use";
import { changeRadioPuzzle, prepareRadioPuzzle, radioPuzzleSucceeded, type RadioPuzzleConfig,
  type RadioPiece } from "../../../core/equipment/radio-puzzle";
import { toolMechanicSignature } from "../../../documents/item/point-of-interest-data";
import type { RadioCommand, RadioResponse, RadioResumeIntent, RadioView } from "../../../application/equipment/radio-session";
import type { RadioSnapshot } from "../../../application/equipment/radio-snapshot";
import { isAgentCheckChoices, prepareAgentCheckExecution } from "../../../features/checks/resolve-agent-check-interaction";
import { confirmCheckAbilityUses } from "../../../features/checks/check-ability-uses";
import { executeFoundryCheck, type FoundryCheckExecution } from "../dice/execute-foundry-check";
import { isRegisteredMessageMode } from "../chat/publish-check-message";
import { publishRadioCheck, publishRadioResult } from "../chat/publish-radio-result";
import { grantToolKnowledge, isPoiToolContext, radioInteraction, recoverToolKnowledgeCount,
  type ToolKnowledgeReceipt } from "../points-of-interest/poi-tool-context";
import { activeEquipmentAuthority, equipmentSessionGuardResult, executeEquipmentUse, isEquipmentUseIntent,
  ownedEquipmentForUser, type EquipmentUseIntent, type EquipmentUseResult, type ResolvedEquipmentUse } from "./execute-equipment-use";
import { enqueueEquipmentOperation } from "./equipment-operation-queue";
import type { AppliedCheckAbilityUse } from "../../../application/checks/check-ability-use-state";

export const RADIO_QUERY = `${SYSTEM_ID}.radio`;
export const RADIO_RESUME_QUERY = `${SYSTEM_ID}.resumeRadio`;
interface Receipt { readonly binding: string; readonly command: RadioCommand; response?: RadioResponse }
interface Session {
  readonly id: string;
  readonly authorityId: string;
  readonly requesterId: string;
  readonly input: RadioResumeIntent;
  readonly binding: string;
  readonly config: RadioPuzzleConfig;
  readonly informationIds: readonly string[];
  readonly sourceUuid: string;
  readonly consumesUse: boolean;
  readonly commands: Map<string, Receipt>;
  readonly knowledge: ToolKnowledgeReceipt;
  resolved: ResolvedEquipmentUse;
  revision: number;
  state: RadioView["state"];
  started: boolean;
  initial: readonly RadioPiece[];
  active: readonly RadioPiece[];
  discarded: readonly RadioPiece[];
  removedCount: number;
  preparedCheck?: ReturnType<typeof prepareAgentCheckExecution>;
  execution?: FoundryCheckExecution;
  appliedAbilityUses?: readonly AppliedCheckAbilityUse[];
  checkPublished: boolean;
  uncertain: boolean;
  published: boolean;
  snapshot?: RadioSnapshot;
  terminal?: EquipmentUseResult;
  pendingCommandId?: string;
  equipmentName: string;
  formName: string;
  actorName: string;
}
const sessions = new Map<string, Session>();
const operations = new Map<string, string>();
const active = new Map<string, string>();
const equipmentKey = (input: EquipmentUseIntent) => `${input.actorUuid}:${input.equipmentId}`;
const operationKey = (input: EquipmentUseIntent, requesterId: string) => `${requesterId}:${input.operationId}`;
const bindingOf = (input: RadioResumeIntent) => JSON.stringify([input.actorUuid, input.equipmentId, input.useFormId,
  input.context.sceneId, input.context.itemUuid, input.context.runId]);
const terminalState = (session: Session) => !["prepared", "active"].includes(session.state);
function response(session: Session): RadioResponse {
  const pending = session.pendingCommandId && session.commands.get(session.pendingCommandId)?.command;
  return { status: "radio", view: { sessionId: session.id, revision: session.revision,
    equipmentName: session.equipmentName, formName: session.formName,
    state: ["success", "failure"].includes(session.state) && !session.published ? "active" : session.state,
    removedCount: session.removedCount, active: structuredClone(session.active), discarded: structuredClone(session.discarded),
    ...(pending ? { pendingCommand: structuredClone(pending) } : {}) },
    ...(session.terminal && (!session.started || session.published) ? { terminal: { ...session.terminal } } : {}) };
}
function currentResolved(session: Session, requester: foundry.documents.User): ResolvedEquipmentUse | null {
  const owned = ownedEquipmentForUser(session.input, requester);
  const use = owned && readEquipmentUseForms((owned.equipment.system as { useForms?: unknown }).useForms)
    ?.find(form => form.id === session.input.useFormId);
  if (!owned || owned.actor !== session.resolved.actor || owned.equipment !== session.resolved.equipment
    || !use || use.mechanic !== "radio" || use.consumesUse !== session.consumesUse || owned.sourceUuid !== session.sourceUuid) return null;
  const resolved = { ...owned, use };
  return toolMechanicSignature(radioInteraction(session.input.context, resolved, requester)?.config)
    === toolMechanicSignature(session.config) ? resolved : null;
}
export function radioSessionGuard(input: EquipmentUseIntent, requester: foundry.documents.User): EquipmentUseResult | null {
  const session = sessions.get(active.get(equipmentKey(input)) ?? "");
  return session && operationKey(session.input, session.requesterId) !== operationKey(input, requester.id) ? { status: "busy" } : null;
}
export async function resumeRadio(input: RadioResumeIntent, requester: foundry.documents.User): Promise<RadioResponse | null> {
  if (!activeEquipmentAuthority(requester)) return { status: "forbidden" };
  if (!isEquipmentUseIntent(input) || !isPoiToolContext(input.context)) return { status: "invalid" };
  return enqueueEquipmentOperation(input.actorUuid, input.equipmentId, async () => {
    const session = sessions.get(active.get(equipmentKey(input)) ?? "");
    if (!session) return null;
    if (!ownedEquipmentForUser(input, requester)) return { status: "forbidden" };
    if (session.requesterId !== requester.id || session.binding !== bindingOf(input)) return { status: "busy" };
    if (session.authorityId !== game.user.id) return { status: "uncertain" };
    if (!currentResolved(session, requester) && !terminalState(session)) return invalidate(session);
    return response(session);
  });
}
export async function prepareRadio(input: RadioResumeIntent, requester: foundry.documents.User): Promise<RadioResponse> {
  if (!activeEquipmentAuthority(requester)) return { status: "forbidden" };
  if (!isEquipmentUseIntent(input) || !isPoiToolContext(input.context)) return { status: "invalid" };
  return enqueueEquipmentOperation(input.actorUuid, input.equipmentId, async () => {
    const previous = sessions.get(operations.get(operationKey(input, requester.id)) ?? "");
    if (previous) return previous.binding === bindingOf(input) && previous.authorityId === game.user.id
      ? response(previous) : { status: "invalid" };
    const occupied = sessions.get(active.get(equipmentKey(input)) ?? "");
    if (occupied?.terminal) {
      const result = await publishTerminal(occupied);
      if (result.status === "partial") return { status: "busy" };
    }
    const guarded = equipmentSessionGuardResult(input, requester) ?? radioSessionGuard(input, requester);
    if (guarded) return guarded;
    const owned = ownedEquipmentForUser(input, requester);
    if (!owned) return { status: "forbidden" };
    const use = readEquipmentUseForms((owned.equipment.system as { useForms?: unknown }).useForms)?.find(form => form.id === input.useFormId);
    if (!use || use.mechanic !== "radio") return { status: "invalid" };
    const resolved = { ...owned, use };
    const interaction = radioInteraction(input.context, resolved, requester);
    if (!interaction || !owned.sourceUuid) return { status: "invalid" };
    const session: Session = { id: crypto.randomUUID(), authorityId: game.user.id, requesterId: requester.id,
      input: structuredClone(input), binding: bindingOf(input), config: interaction.config,
      informationIds: [...interaction.informationIds], sourceUuid: owned.sourceUuid, consumesUse: use.consumesUse,
      resolved, commands: new Map(), knowledge: {}, revision: 0, state: "prepared", started: false,
      initial: [], active: [], discarded: [], removedCount: 0, checkPublished: false, uncertain: false, published: false,
      equipmentName: owned.equipment.name, formName: use.name, actorName: owned.actor.name };
    sessions.set(session.id, session); operations.set(operationKey(input, requester.id), session.id);
    active.set(equipmentKey(input), session.id);
    return response(session);
  });
}
function validCommand(input: RadioCommand): boolean {
  if (!input || typeof input.sessionId !== "string" || typeof input.commandId !== "string" || !input.commandId
    || input.commandId.length > 100 || !Number.isSafeInteger(input.revision) || input.revision < 0
    || !["start", "move", "discard", "restore", "finish", "cancel", "get"].includes(input.action)) return false;
  const extraKeys = input.action === "start" ? ["choices", "messageMode"] : input.action === "move"
    ? ["pieceId", "direction"] : ["discard", "restore"].includes(input.action) ? ["pieceId"] : [];
  if (Object.keys(input).some(key => !["sessionId", "commandId", "revision", "action", ...extraKeys].includes(key))) return false;
  if (input.action === "start") return isAgentCheckChoices(input.choices) && input.choices.difficulty === undefined
    && isRegisteredMessageMode(input.messageMode);
  if (["move", "discard", "restore"].includes(input.action) && (typeof input.pieceId !== "string" || !input.pieceId)) return false;
  return input.action !== "move" || input.direction === -1 || input.direction === 1;
}
function receiptFor(session: Session, input: RadioCommand): Receipt | null {
  const binding = JSON.stringify([input.action, input.revision, input.pieceId, input.direction, input.choices, input.messageMode]);
  const previous = session.commands.get(input.commandId);
  if (previous) return previous.binding === binding ? previous : null;
  if (input.action !== "get" && input.revision !== session.revision
    || session.pendingCommandId && !["get", "cancel"].includes(input.action)) return null;
  const receipt: Receipt = { binding, command: structuredClone(input) };
  session.commands.set(input.commandId, receipt);
  if (input.action !== "get") session.pendingCommandId = input.commandId;
  return receipt;
}
function complete(session: Session, input: RadioCommand, receipt: Receipt, result: RadioResponse): RadioResponse {
  if (receipt.response) return structuredClone(receipt.response);
  if (["partial", "uncertain"].includes(result.status)) return result;
  if (session.pendingCommandId === input.commandId) session.pendingCommandId = undefined;
  if (result.status === "radio" && result.view.pendingCommand?.commandId === input.commandId) {
    const { pendingCommand: _pending, ...view } = result.view;
    result = { ...result, view };
  }
  receipt.response = structuredClone(result);
  return result;
}
async function publishTerminal(session: Session): Promise<RadioResponse> {
  if (session.started && !session.published) {
    session.snapshot ??= { schemaVersion: 1, equipmentName: session.equipmentName, formName: session.formName,
      actorName: session.actorName, initial: structuredClone(session.initial), active: structuredClone(session.active),
      discarded: structuredClone(session.discarded), removedCount: session.removedCount,
      outcome: session.state as RadioSnapshot["outcome"], newCount: session.knowledge.newCount ?? 0 };
    try { await publishRadioResult(session.resolved.actor, operationKey(session.input, session.requesterId), session.snapshot); session.published = true; }
    catch { return { status: "partial", stage: "publication" }; }
  }
  if (active.get(equipmentKey(session.input)) === session.id) active.delete(equipmentKey(session.input));
  return response(session);
}
async function invalidate(session: Session): Promise<RadioResponse> {
  const committed = recoverToolKnowledgeCount(session.input.context, session.resolved, session.knowledge);
  if (session.state === "success" && committed !== undefined) {
    session.terminal = { status: "success", newCount: committed, manual: false };
  } else {
    session.state = "invalidated"; session.revision++; session.terminal = { status: "invalid" };
  }
  return publishTerminal(session);
}
async function start(session: Session, input: RadioCommand, requester: foundry.documents.User): Promise<RadioResponse> {
  if (session.uncertain) return { status: "uncertain" };
  let publicationFailed = false;
  const result = await executeEquipmentUse(session.input, requester, `radio:${session.binding}`, async () => {
    if (!currentResolved(session, requester)) throw new Error("Radio context changed.");
    if (!session.execution) {
      try { session.execution = await executeFoundryCheck(session.preparedCheck!.effectiveInput); }
      catch { session.uncertain = true; throw new Error("Radio Check evaluation needs manual reconciliation."); }
    }
    if (!session.appliedAbilityUses) {
      try { session.appliedAbilityUses = await confirmCheckAbilityUses(session.resolved.actor, session.preparedCheck!.selectedInput,
        input.choices!.extraDice, session.preparedCheck!.preparedAbilityUses); }
      catch { session.uncertain = true; throw new Error("Radio Check cost needs manual reconciliation."); }
    }
    if (!currentResolved(session, requester)) throw new Error("Radio context changed after Check.");
    if (!session.checkPublished) {
      try { await publishRadioCheck(session.resolved.actor, requester, operationKey(session.input, session.requesterId),
        { execution: session.execution, appliedAbilityUses: session.appliedAbilityUses }, input.messageMode!); }
      catch { publicationFailed = true; throw new Error("Radio Check publication was not confirmed."); }
      session.checkPublished = true;
    }
    if (session.state === "prepared") {
      const puzzle = prepareRadioPuzzle(session.config, session.execution.result.total, Math.random, () => crypto.randomUUID());
      session.initial = structuredClone(puzzle.active); session.active = puzzle.active; session.discarded = puzzle.discarded;
      session.removedCount = puzzle.removedCount; session.state = "active"; session.revision++;
    }
    return { newCount: 0, manual: false };
  }, { expectedMechanic: "radio", postUseFailureStage: "analysis",
    beforePayment: async resolved => {
      if (session.state !== "prepared") return { status: "cancelled" };
      if (!currentResolved(session, requester)) return { status: "invalid" };
      try { session.preparedCheck = prepareAgentCheckExecution(resolved.actor, { kind: "skill", key: "technology" }, input.choices!, requester); }
      catch { return { status: "invalid" }; }
      return null;
    }, onExecuted: resolved => { session.started = true; session.resolved = resolved; session.equipmentName = resolved.equipment.name;
      session.formName = resolved.use!.name; session.actorName = resolved.actor.name; },
  });
  return session.uncertain ? { status: "uncertain" } : publicationFailed ? { status: "partial", stage: "publication" }
    : result.status === "success" ? response(session) : result;
}
async function finish(session: Session, requester: foundry.documents.User): Promise<RadioResponse> {
  if (session.state === "active") { session.state = radioPuzzleSucceeded(session.config, session) ? "success" : "failure"; session.revision++; }
  if (session.state === "success") {
    recoverToolKnowledgeCount(session.input.context, session.resolved, session.knowledge);
    const resolved = currentResolved(session, requester);
    if (!resolved && session.knowledge.newCount === undefined) return invalidate(session);
    try {
      const result = resolved ? await grantToolKnowledge(session.input.context, resolved, requester,
        { radioConfig: session.config, informationIds: session.informationIds }, session.knowledge)
        : { newCount: session.knowledge.newCount!, manual: false };
      session.terminal = { status: "success", ...result };
    } catch { return { status: "partial", stage: "discovery" }; }
  } else session.terminal = { status: "success", newCount: 0, manual: false };
  return publishTerminal(session);
}
async function command(session: Session, input: RadioCommand, requester: foundry.documents.User): Promise<RadioResponse> {
  if (input.action === "cancel" && session.state === "success" && !session.terminal
    && recoverToolKnowledgeCount(session.input.context, session.resolved, session.knowledge) === undefined) {
    session.state = "cancelled"; session.revision++; session.terminal = { status: "cancelled" }; return publishTerminal(session);
  }
  if (input.action === "get") return response(session);
  if (terminalState(session)) return session.state === "success" && !session.terminal ? finish(session, requester) : publishTerminal(session);
  if (input.action === "cancel") {
    session.state = "cancelled"; session.revision++; session.terminal = { status: "cancelled" }; return publishTerminal(session);
  }
  if (session.state !== "active") return { status: "invalid" };
  if (input.action === "finish") return finish(session, requester);
  if (["move", "discard", "restore"].includes(input.action)) {
    try {
      const changed = changeRadioPuzzle(session, input.action as "move" | "discard" | "restore", input.pieceId!, input.direction);
      session.active = changed.active; session.discarded = changed.discarded; session.revision++;
      return response(session);
    } catch { return { status: "invalid" }; }
  }
  return { status: "invalid" };
}
export async function resolveRadioCommand(input: RadioCommand, requester: foundry.documents.User): Promise<RadioResponse> {
  if (!activeEquipmentAuthority(requester)) return { status: "forbidden" };
  if (!validCommand(input)) return { status: "invalid" };
  const session = sessions.get(input.sessionId);
  if (!session || session.authorityId !== game.user.id) return { status: "uncertain" };
  if (session.requesterId !== requester.id) return { status: "forbidden" };
  if (!ownedEquipmentForUser(session.input, requester)) {
    if (!terminalState(session)) await enqueueEquipmentOperation(session.input.actorUuid, session.input.equipmentId, () => invalidate(session));
    return { status: "forbidden" };
  }
  if (input.action === "start") {
    if (!terminalState(session) && !currentResolved(session, requester))
      return enqueueEquipmentOperation(session.input.actorUuid, session.input.equipmentId, () => invalidate(session));
    const receipt = receiptFor(session, input);
    if (!receipt) return { status: "invalid" };
    if (receipt.response) return structuredClone(receipt.response);
    if (terminalState(session)) return complete(session, input, receipt, response(session));
    const result = await start(session, input, requester);
    return complete(session, input, receipt, result);
  }
  return enqueueEquipmentOperation(session.input.actorUuid, session.input.equipmentId, async () => {
    if (input.action !== "cancel" && !terminalState(session) && !currentResolved(session, requester)) return invalidate(session);
    const receipt = receiptFor(session, input);
    if (!receipt) return { status: "invalid" };
    if (receipt.response) return structuredClone(receipt.response);
    return complete(session, input, receipt, await command(session, input, requester));
  });
}
export function registerRadioQueries(): void {
  const queries = (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries;
  queries[RADIO_QUERY] = (input: RadioCommand, context: { user: foundry.documents.User }) => resolveRadioCommand(input, context.user);
  queries[RADIO_RESUME_QUERY] = (input: RadioResumeIntent, context: { user: foundry.documents.User }) => resumeRadio(input, context.user);
}
