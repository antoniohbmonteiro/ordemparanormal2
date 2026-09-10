import {
  doesSnapshotMatchSelection,
  parseOpposedCheckState,
  type OpposedCheckSide,
} from "../../application/checks/opposed-check-state";
import { isSupportedCheckSnapshot, type CheckSnapshotV3 } from "../../application/checks/check-snapshot";
import { resolveOpposedCheckParticipant } from "../../adapters/foundry/actors/resolve-opposed-check-participant";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { renderOpposedCheckContent } from "../../adapters/foundry/chat/create-opposed-check-message";
import {
  CARD_PRESENTATION_FLAG,
  OPPOSED_CHECK_CARD_KIND,
  OPPOSED_CHECK_STATE_FLAG,
  SYSTEM_ID,
} from "../../config/system-config";

export interface SubmitOpposedCheckResultData {
  readonly messageId: string;
  readonly side: OpposedCheckSide;
  readonly result: CheckSnapshotV3;
}

const queues = new Map<string, Promise<void>>();

function getUsers() {
  return (game as typeof game & {
    readonly users: {
      readonly activeGM: foundry.documents.User | null;
      get(id: string): foundry.documents.User | undefined;
    };
  }).users;
}

function getMessage(id: string): ChatMessage | null {
  const foundryGame = game as typeof game & {
    readonly messages?: { get(id: string): ChatMessage | undefined };
  };
  return foundryGame.messages?.get(id) ?? null;
}

export function parseSubmitOpposedCheckResultData(
  value: unknown,
): SubmitOpposedCheckResultData | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["messageId", "side", "result"].includes(key))) return null;
  if (typeof data.messageId !== "string" || data.messageId.trim() === "") return null;
  if (data.side !== "left" && data.side !== "right") return null;
  if (!isSupportedCheckSnapshot(data.result) || data.result.schemaVersion !== 3) return null;
  return { messageId: data.messageId, side: data.side, result: data.result };
}

async function persist(
  data: SubmitOpposedCheckResultData,
  sender: foundry.documents.User,
): Promise<void> {
  const users = getUsers();
  if (users.activeGM?.id !== game.user.id) {
    throw new Error("The current client is not the active GM.");
  }
  const canonicalSender = users.get(sender.id);
  if (!canonicalSender) throw new Error("The querying User no longer exists.");

  const message = getMessage(data.messageId);
  if (!message) throw new Error("Opposed Check message no longer exists.");
  const presentation = message.getFlag(SYSTEM_ID, CARD_PRESENTATION_FLAG) as
    | { readonly card?: unknown }
    | undefined;
  if (presentation?.card !== OPPOSED_CHECK_CARD_KIND) {
    throw new Error("Message is not an Opposed Check.");
  }
  const state = parseOpposedCheckState(
    message.getFlag(SYSTEM_ID, OPPOSED_CHECK_STATE_FLAG),
  );
  if (!state) throw new Error("Opposed Check state is invalid.");
  const sideState = state[data.side];
  if (sideState.result) throw new Error("This Opposed Check side has already rolled.");
  const actor = await resolveOpposedCheckParticipant(sideState.participant);
  if (!actor) throw new Error("Opposed Check participant is no longer available.");
  if (!canUserRollActor(actor, canonicalSender)) {
    throw new Error("The querying User cannot roll this participant.");
  }
  if (!doesSnapshotMatchSelection(data.result, sideState.selection)) {
    throw new Error("Submitted result does not match the requested Check.");
  }

  const nextState = {
    ...state,
    [data.side]: { ...sideState, result: data.result },
  };
  const content = await renderOpposedCheckContent(nextState);
  if (users.activeGM?.id !== game.user.id) {
    throw new Error("Opposed Check authority changed before update.");
  }
  await message.update({
    content,
    [`flags.${SYSTEM_ID}.${OPPOSED_CHECK_STATE_FLAG}`]: nextState,
  });
}

export async function submitOpposedCheckResult(
  data: SubmitOpposedCheckResultData,
  sender: foundry.documents.User,
): Promise<void> {
  const previous = queues.get(data.messageId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => persist(data, sender));
  queues.set(data.messageId, current);
  try {
    await current;
  } finally {
    if (queues.get(data.messageId) === current) queues.delete(data.messageId);
  }
}
