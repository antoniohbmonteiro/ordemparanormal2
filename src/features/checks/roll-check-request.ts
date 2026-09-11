import { createCheckSnapshot } from "../../application/checks/check-snapshot";
import { resolveAgentCheckParticipant } from "../../adapters/foundry/actors/resolve-agent-check-participant";
import { dispatchCheckRequestResult } from "../../adapters/foundry/chat/check-request-result-query";
import { readCheckRequestMessageLifecycle } from "../../adapters/foundry/chat/read-check-request-message";
import { showDiceAnimationIfAvailable } from "../../adapters/foundry/dice/show-dice-animation-if-available";
import { resolveAgentCheckInteraction } from "./resolve-agent-check-interaction";

function getMessage(id: string): ChatMessage | null {
  const foundryGame = game as typeof game & {
    readonly messages?: { get(id: string): ChatMessage | undefined };
  };
  return foundryGame.messages?.get(id) ?? null;
}

export type RollCheckRequestOutcome = "canceled" | "submitted";

export async function rollCheckRequest(
  messageId: string,
): Promise<RollCheckRequestOutcome> {
  const message = getMessage(messageId);
  if (!message) throw new Error("Check Request message no longer exists.");
  const lifecycle = readCheckRequestMessageLifecycle(message);
  if (!lifecycle || lifecycle.state.status !== "pending") {
    throw new Error("Check Request is not pending.");
  }
  const actor = await resolveAgentCheckParticipant(lifecycle.state.participant);
  if (!actor) throw new Error("Check Request participant is no longer available.");
  const interactionOptions = lifecycle.state.difficulty === undefined
    ? { allowDifficulty: false as const }
    : { lockedDifficulty: lifecycle.state.difficulty };
  const resolved = await resolveAgentCheckInteraction(
    actor,
    lifecycle.state.selection,
    interactionOptions,
  );
  if (!resolved) return "canceled";
  await showDiceAnimationIfAvailable(resolved.execution.roll);
  await dispatchCheckRequestResult({
    messageId,
    result: createCheckSnapshot(
      resolved.execution.result,
      resolved.difficultyResolution,
    ),
  });
  return "submitted";
}
