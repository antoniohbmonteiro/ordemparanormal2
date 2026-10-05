import { SYSTEM_ID } from "../../../config/system-config";
import { readEquipmentUseForms } from "../../../core/equipment/equipment-use";
import { applyLaboratoryReroll, laboratoryBreaks, laboratoryBudget, laboratoryDice, validLaboratorySelection,
  type LaboratoryDie, type LaboratoryLength } from "../../../core/equipment/laboratory-challenge";
import type { LaboratoryCommand, LaboratoryResponse, LaboratoryView } from "../../../application/equipment/laboratory-session";
import type { LaboratorySnapshot } from "../../../application/equipment/laboratory-snapshot";
import { executeLaboratoryRoll, type LaboratoryRoll } from "../dice/execute-laboratory-roll";
import { publishLaboratoryResult } from "../chat/publish-laboratory-result";
import { grantToolKnowledge, isPoiToolContext, laboratoryInteraction, classifyLaboratoryInteraction, recoverToolKnowledgeCount,
  type PoiToolContext, type ToolKnowledgeReceipt, type UnconfiguredPoiToolUse } from "../points-of-interest/poi-tool-context";
import { activeEquipmentAuthority, executeEquipmentUse, isEquipmentUseIntent, ownedEquipmentForUser,
  registerEquipmentSessionGuard, equipmentSessionGuardResult, type EquipmentUseIntent, type EquipmentUseResult,
  type ResolvedEquipmentUse } from "./execute-equipment-use";
import { enqueueEquipmentOperation } from "./equipment-operation-queue";

export const LABORATORY_QUERY = `${SYSTEM_ID}.laboratory`;
interface CommandReceipt {
  readonly binding: string;
  readonly rolls: LaboratoryRoll[];
  readonly command: LaboratoryCommand;
  response?: LaboratoryResponse;
}
interface Session {
  readonly id: string;
  readonly authorityId: string;
  readonly requesterId: string;
  readonly intent: EquipmentUseIntent;
  readonly context: PoiToolContext;
  readonly binding: string;
  readonly sourceUuid: string;
  readonly consumesUse: boolean;
  readonly length: LaboratoryLength;
  readonly informationIds: readonly string[];
  readonly commands: Map<string, CommandReceipt>;
  readonly knowledge: ToolKnowledgeReceipt;
  readonly initial: LaboratoryRoll[];
  readonly rerolls: { positions: readonly number[]; rolls: readonly LaboratoryRoll[] }[];
  revision: number;
  state: LaboratoryView["state"];
  started: boolean;
  resolved: ResolvedEquipmentUse;
  mind?: number;
  ceiling?: LaboratoryDie;
  dice: readonly LaboratoryDie[];
  results: readonly number[];
  remaining: number;
  equipmentName: string;
  formName: string;
  actorName: string;
  terminal?: EquipmentUseResult;
  snapshot?: LaboratorySnapshot;
  published: boolean;
  pendingCommandId?: string;
}
const sessions = new Map<string, Session>();
const operations = new Map<string, string>();
const active = new Map<string, string>();
const equipmentKey = (input: EquipmentUseIntent) => `${input.actorUuid}:${input.equipmentId}`;
const operationKey = (input: EquipmentUseIntent, requesterId: string) => `${requesterId}:${input.operationId}`;
const terminalState = (state: Session["state"]) => !["prepared", "active"].includes(state);
function view(session: Session): LaboratoryView {
  return { sessionId: session.id, revision: session.revision, equipmentName: session.equipmentName,
    formName: session.formName,
    state: ["success", "failure"].includes(session.state) && !session.published ? "active" : session.state,
    dice: [...session.dice], results: [...session.results],
    remaining: session.remaining, ceiling: session.ceiling ?? null,
    ...(session.pendingCommandId && session.commands.get(session.pendingCommandId)
      ? { pendingCommand: structuredClone(session.commands.get(session.pendingCommandId)!.command) } : {}) };
}
function response(session: Session): LaboratoryResponse {
  return { status: "laboratory", view: view(session),
    ...(session.terminal && (!session.started || session.published) ? { terminal: { ...session.terminal } } : {}) };
}
function currentResolved(session: Session, requester: foundry.documents.User): ResolvedEquipmentUse | null {
  const owned = ownedEquipmentForUser(session.intent, requester);
  const use = owned && readEquipmentUseForms((owned.equipment.system as { useForms?: unknown }).useForms)
    ?.find(form => form.id === session.intent.useFormId);
  if (!owned || owned.actor !== session.resolved.actor || owned.equipment !== session.resolved.equipment
    || !use || use.mechanic !== "laboratory" || use.consumesUse !== session.consumesUse
    || owned.sourceUuid !== session.sourceUuid || !owned.isTool) return null;
  const resolved = { ...owned, use };
  return laboratoryInteraction(session.context, resolved, requester)?.length === session.length ? resolved : null;
}

export async function prepareLaboratory(input: EquipmentUseIntent & { readonly context: PoiToolContext },
  requester: foundry.documents.User): Promise<LaboratoryResponse | UnconfiguredPoiToolUse> {
  if (!activeEquipmentAuthority(requester)) return { status: "forbidden" };
  if (!isEquipmentUseIntent(input) || !isPoiToolContext(input.context)) return { status: "invalid" };
  return enqueueEquipmentOperation(input.actorUuid, input.equipmentId, async () => {
    const binding = JSON.stringify([input.actorUuid, input.equipmentId, input.useFormId,
      input.context.sceneId, input.context.itemUuid, input.context.runId]);
    const previous = sessions.get(operations.get(operationKey(input, requester.id)) ?? "");
    if (previous) {
      if (previous.binding !== binding || previous.authorityId !== game.user.id) return { status: "invalid" };
      return terminalState(previous.state) && previous.terminal ? publishTerminal(previous) : response(previous);
    }
    const occupied = sessions.get(active.get(equipmentKey(input)) ?? "");
    if (occupied) {
      const owner = (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(occupied.requesterId);
      if (terminalState(occupied.state) && occupied.terminal) await publishTerminal(occupied);
      else if (!owner || !currentResolved(occupied, owner)) {
        const committed = recoverToolKnowledgeCount(occupied.context, occupied.resolved, occupied.knowledge);
        if (occupied.state === "success" && committed !== undefined) {
          occupied.terminal = { status: "success", newCount: committed, manual: false };
          await publishTerminal(occupied);
        } else await invalidate(occupied);
      }
      if (active.has(equipmentKey(input))) return { status: "busy" };
    }
    const guarded = equipmentSessionGuardResult(input, requester);
    if (guarded) return guarded;
    const owned = ownedEquipmentForUser(input, requester);
    const use = owned && readEquipmentUseForms((owned.equipment.system as { useForms?: unknown }).useForms)
      ?.find(form => form.id === input.useFormId);
    if (!owned) return { status: "forbidden" };
    if (!use || use.mechanic !== "laboratory") return { status: "invalid" };
    const resolved = { ...owned, use };
    const classified = classifyLaboratoryInteraction(input.context, resolved, requester);
    if (classified.status === "absent") return { status: "unconfigured", mechanic: "laboratory" };
    if (classified.status !== "ready" || !resolved.sourceUuid) return { status: "invalid" };
    const interaction = classified.interaction;
    const session: Session = { id: crypto.randomUUID(), authorityId: game.user.id, requesterId: requester.id,
      intent: { actorUuid: input.actorUuid, equipmentId: input.equipmentId, useFormId: input.useFormId, operationId: input.operationId },
      context: { sceneId: input.context.sceneId, itemUuid: input.context.itemUuid, runId: input.context.runId }, binding,
      sourceUuid: resolved.sourceUuid, consumesUse: use.consumesUse, length: interaction.length,
      informationIds: [...interaction.informationIds], commands: new Map(), knowledge: {}, initial: [], rerolls: [],
      revision: 0, state: "prepared", started: false, resolved, dice: [], results: [], remaining: 0,
      equipmentName: resolved.equipment.name, formName: use.name, actorName: resolved.actor.name, published: false };
    sessions.set(session.id, session);
    operations.set(operationKey(input, requester.id), session.id);
    active.set(equipmentKey(input), session.id);
    return response(session);
  });
}
function validCommand(input: LaboratoryCommand): boolean {
  return !!input && typeof input.sessionId === "string" && typeof input.commandId === "string"
    && !!input.commandId && input.commandId.length <= 100 && Number.isSafeInteger(input.revision) && input.revision >= 0
    && ["start", "reroll", "finish", "cancel", "get"].includes(input.action)
    && (input.action === "reroll" ? Array.isArray(input.positions) : input.positions === undefined);
}
function receiptFor(session: Session, input: LaboratoryCommand): CommandReceipt | null {
  const binding = JSON.stringify([input.action, input.revision, input.positions ?? null]);
  const previous = session.commands.get(input.commandId);
  if (previous) return previous.binding === binding ? previous : null;
  if (session.pendingCommandId && !["get", "cancel"].includes(input.action)) return null;
  if (input.action !== "get" && input.revision !== session.revision) return null;
  const receipt = { binding, rolls: [], command: structuredClone(input) };
  session.commands.set(input.commandId, receipt);
  if (!["get", "cancel"].includes(input.action)) session.pendingCommandId = input.commandId;
  return receipt;
}
function completeCommand(session: Session, input: LaboratoryCommand, receipt: CommandReceipt,
  result: LaboratoryResponse): LaboratoryResponse {
  if (receipt.response) return structuredClone(receipt.response);
  if (result.status === "partial" || result.status === "uncertain") return result;
  if (session.pendingCommandId === input.commandId) session.pendingCommandId = undefined;
  let confirmed = result;
  if (result.status === "laboratory" && result.view.pendingCommand?.commandId === input.commandId) {
    const { pendingCommand: _pending, ...view } = result.view;
    confirmed = { ...result, view };
  }
  receipt.response = structuredClone(confirmed);
  return confirmed;
}
async function publishTerminal(session: Session): Promise<LaboratoryResponse> {
  if (!session.started) {
    session.terminal ??= { status: "cancelled" };
  } else if (!session.published) {
    const incomplete = [...session.commands.values()].filter(receipt => receipt.command.action === "reroll"
      && receipt.rolls.length > 0 && !receipt.response
      && !session.rerolls.some(entry => entry.rolls[0] === receipt.rolls[0]));
    session.snapshot ??= {
      schemaVersion: 1, equipmentName: session.equipmentName, formName: session.formName, actorName: session.actorName,
      mind: session.mind!, ceiling: session.ceiling!, dice: [...session.dice], initial: session.initial.map(roll => roll.value),
      rerolls: [...session.rerolls.map(entry => ({ positions: [...entry.positions], results: entry.rolls.map(roll => roll.value), completed: true })),
        ...incomplete.map(receipt => ({ positions: receipt.command.positions!.slice(0, receipt.rolls.length),
          results: receipt.rolls.map(roll => roll.value), completed: false }))],
      results: [...session.results], remaining: session.remaining, outcome: session.state as LaboratorySnapshot["outcome"],
      newCount: session.knowledge.newCount ?? 0,
      rolls: [...session.initial, ...session.rerolls.flatMap(entry => entry.rolls), ...incomplete.flatMap(receipt => receipt.rolls)]
        .map(roll => structuredClone(roll.serialized)),
    };
    try {
      await publishLaboratoryResult(session.resolved.actor, operationKey(session.intent, session.requesterId), session.snapshot);
      session.published = true;
    } catch { return { status: "partial", stage: "publication" }; }
  }
  if (active.get(equipmentKey(session.intent)) === session.id) active.delete(equipmentKey(session.intent));
  return response(session);
}
async function invalidate(session: Session): Promise<LaboratoryResponse> {
  session.state = "invalidated";
  session.revision++;
  session.terminal = { status: "invalid" };
  const result = await publishTerminal(session);
  return result.status === "partial" ? result : response(session);
}
async function start(session: Session, requester: foundry.documents.User): Promise<LaboratoryResponse> {
  if (session.state !== "prepared") return response(session);
  const result = await executeEquipmentUse(session.intent, requester, `laboratory:${session.binding}`, async () => {
    if (session.state !== "prepared") return { newCount: 0, manual: false };
    if (!currentResolved(session, requester)) throw new Error("Laboratory context changed before initial roll.");
    // Retain individually completed rolls if an evaluation fails partway through the sequence.
    for (let index = session.initial.length; index < session.dice.length; index++)
      session.initial.push(await executeLaboratoryRoll(session.dice[index]!));
    if (!currentResolved(session, requester)) throw new Error("Laboratory context changed during initial roll.");
    session.results = session.initial.map(roll => roll.value);
    session.state = "active";
    session.revision++;
    return { newCount: 0, manual: false };
  }, {
    expectedMechanic: "laboratory", postUseFailureStage: "analysis",
    beforePayment: async resolved => {
      if (session.state !== "prepared") return { status: "cancelled" };
      if (!currentResolved(session, requester)) return { status: "invalid" };
      const system = resolved.actor.system as { attributes?: { mind?: number }; skills?: { aptitude?: { exactSciences?: number } } };
      try {
        session.mind = system.attributes?.mind;
        session.ceiling = system.skills?.aptitude?.exactSciences as LaboratoryDie;
        session.dice = laboratoryDice(session.length, session.ceiling);
        session.remaining = laboratoryBudget(session.mind!);
      } catch { return { status: "invalid" }; }
      return null;
    },
    onExecuted: resolved => {
      session.started = true;
      session.resolved = resolved;
      session.equipmentName = resolved.equipment.name;
      session.formName = resolved.use!.name;
      session.actorName = resolved.actor.name;
    },
  });
  if (result.status === "success") return response(session);
  return result;
}
async function command(session: Session, input: LaboratoryCommand, requester: foundry.documents.User,
  receipt: CommandReceipt): Promise<LaboratoryResponse> {
  if (input.action === "cancel" && session.state === "success" && !session.terminal
    && recoverToolKnowledgeCount(session.context, session.resolved, session.knowledge) === undefined) {
    session.state = "cancelled";
    session.revision++;
    session.terminal = { status: "cancelled" };
    return publishTerminal(session);
  }
  if (input.action === "get") return terminalState(session.state) || currentResolved(session, requester)
    ? response(session) : invalidate(session);
  if (terminalState(session.state)) {
    if (session.state === "success" && !session.terminal) return finish(session, requester);
    return publishTerminal(session);
  }
  if (input.action === "cancel") {
    session.state = "cancelled";
    session.revision++;
    session.terminal = { status: "cancelled" };
    return publishTerminal(session);
  }
  if (!currentResolved(session, requester)) return invalidate(session);
  if (input.action === "reroll") {
    if (session.state !== "active" || !validLaboratorySelection(session, input.positions!)) return { status: "invalid" };
    try {
      for (let index = receipt.rolls.length; index < input.positions!.length; index++)
        receipt.rolls.push(await executeLaboratoryRoll(session.dice[input.positions![index]!]!));
    } catch { return { status: "partial", stage: "analysis" }; }
    if (!currentResolved(session, requester)) return invalidate(session);
    const next = applyLaboratoryReroll(session, input.positions!, receipt.rolls.map(roll => roll.value));
    session.results = next.results;
    session.remaining = next.remaining;
    session.rerolls.push({ positions: [...input.positions!], rolls: [...receipt.rolls] });
    session.revision++;
    return response(session);
  }
  if (input.action === "finish") {
    if (session.state !== "active") return { status: "invalid" };
    session.state = laboratoryBreaks(session.results).length ? "failure" : "success";
    session.revision++;
    return finish(session, requester);
  }
  return { status: "invalid" };
}
async function finish(session: Session, requester: foundry.documents.User): Promise<LaboratoryResponse> {
  if (session.state === "success") {
    recoverToolKnowledgeCount(session.context, session.resolved, session.knowledge);
    const resolved = currentResolved(session, requester);
    if (!resolved && session.knowledge.newCount === undefined) return invalidate(session);
    try {
      const result = resolved ? await grantToolKnowledge(session.context, resolved, requester,
        { length: session.length, informationIds: session.informationIds }, session.knowledge)
        : { newCount: session.knowledge.newCount!, manual: false };
      session.terminal = { status: "success", ...result };
    } catch { return { status: "partial", stage: "discovery" }; }
  } else session.terminal = { status: "success", newCount: 0, manual: false };
  return publishTerminal(session);
}
export async function resolveLaboratoryCommand(input: LaboratoryCommand, requester: foundry.documents.User): Promise<LaboratoryResponse> {
  if (!activeEquipmentAuthority(requester)) return { status: "forbidden" };
  if (!validCommand(input)) return { status: "invalid" };
  const session = sessions.get(input.sessionId);
  if (!session || session.authorityId !== game.user.id) return { status: "uncertain" };
  if (session.requesterId !== requester.id) return { status: "forbidden" };
  if (!ownedEquipmentForUser(session.intent, requester)) {
    if (!terminalState(session.state)) await enqueueEquipmentOperation(session.intent.actorUuid,
      session.intent.equipmentId, () => invalidate(session));
    return { status: "forbidden" };
  }
  // Start is queued inside the shared executor; never hold that queue while waiting on it.
  if (input.action === "start") {
    if (!terminalState(session.state) && !currentResolved(session, requester))
      return enqueueEquipmentOperation(session.intent.actorUuid, session.intent.equipmentId, () => invalidate(session));
    const receipt = receiptFor(session, input);
    if (!receipt) return { status: "invalid" };
    if (receipt.response) return structuredClone(receipt.response);
    const result = await start(session, requester);
    return completeCommand(session, input, receipt, result);
  }
  return enqueueEquipmentOperation(session.intent.actorUuid, session.intent.equipmentId, async () => {
    if (input.action !== "cancel" && !terminalState(session.state) && !currentResolved(session, requester)) return invalidate(session);
    const receipt = receiptFor(session, input);
    if (!receipt) return { status: "invalid" };
    if (receipt.response) return structuredClone(receipt.response);
    const result = await command(session, input, requester, receipt);
    return completeCommand(session, input, receipt, result);
  });
}
export function laboratorySessionGuard(input: EquipmentUseIntent, requester: foundry.documents.User): EquipmentUseResult | null {
  const session = sessions.get(active.get(equipmentKey(input)) ?? "");
  return session && operationKey(session.intent, session.requesterId) !== operationKey(input, requester.id)
    ? { status: "busy" } : null;
}
export function registerLaboratoryQueries(): void {
  registerEquipmentSessionGuard(laboratorySessionGuard);
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[LABORATORY_QUERY] =
    (input: LaboratoryCommand, context: { user: foundry.documents.User }) => resolveLaboratoryCommand(input, context.user);
}
