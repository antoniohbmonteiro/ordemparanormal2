import {
  isSupportedCheckSnapshot,
  type CheckSnapshotV3,
} from "../../application/checks/check-snapshot";
import { readAgentAccentColor } from "../../adapters/foundry/actors/read-agent-accent-color";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { resolveAgentCheckParticipant } from "../../adapters/foundry/actors/resolve-agent-check-participant";
import {
  doesSnapshotMatchCheckRequest,
  readCheckRequestMessageLifecycle,
} from "../../adapters/foundry/chat/read-check-request-message";
import { renderCheckCardContent } from "../../adapters/foundry/chat/render-check-card-content";
import {
  CHECK_PRESENTATION_FLAG,
  CHECK_REQUEST_STATE_FLAG,
  SYSTEM_ID,
} from "../../config/system-config";

export interface SubmitCheckRequestResultData {
  readonly messageId: string;
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

export function parseSubmitCheckRequestResultData(
  value: unknown,
): SubmitCheckRequestResultData | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["messageId", "result"].includes(key))) return null;
  if (typeof data.messageId !== "string" || data.messageId.trim() === "") return null;
  if (!isSupportedCheckSnapshot(data.result) || data.result.schemaVersion !== 3) return null;
  return { messageId: data.messageId, result: data.result };
}

async function persist(
  data: SubmitCheckRequestResultData,
  sender: foundry.documents.User,
): Promise<void> {
  const users = getUsers();
  if (users.activeGM?.id !== game.user.id) {
    throw new Error("The current client is not the active GM.");
  }
  const canonicalSender = users.get(sender.id);
  if (!canonicalSender) throw new Error("The querying User no longer exists.");
  const message = getMessage(data.messageId);
  if (!message) throw new Error("Check Request message no longer exists.");
  const lifecycle = readCheckRequestMessageLifecycle(message);
  if (!lifecycle || lifecycle.state.status !== "pending") {
    throw new Error("Check Request is not pending.");
  }
  const actor = await resolveAgentCheckParticipant(lifecycle.state.participant);
  if (!actor) throw new Error("Check Request participant is no longer available.");
  if (!canUserRollActor(actor, canonicalSender)) {
    throw new Error("The querying User cannot roll this participant.");
  }
  if (!doesSnapshotMatchCheckRequest(data.result, lifecycle.state)) {
    throw new Error("Submitted result does not match the requested Skill.");
  }
  const nextState = { ...lifecycle.state, status: "resolved" as const };
  const content = await renderCheckCardContent(data.result);
  if (users.activeGM?.id !== game.user.id) {
    throw new Error("Check Request authority changed before update.");
  }
  await message.update({
    content,
    [`flags.${SYSTEM_ID}.${CHECK_REQUEST_STATE_FLAG}`]: nextState,
    [`flags.${SYSTEM_ID}.check`]: data.result,
    [`flags.${SYSTEM_ID}.${CHECK_PRESENTATION_FLAG}`]: {
      accentColor: readAgentAccentColor(actor),
    },
  });
}

export async function submitCheckRequestResult(
  data: SubmitCheckRequestResultData,
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
