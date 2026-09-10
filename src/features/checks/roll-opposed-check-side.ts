import { createCheckSnapshot } from "../../application/checks/check-snapshot";
import { parseOpposedCheckState, type OpposedCheckSide } from "../../application/checks/opposed-check-state";
import { resolveOpposedCheckParticipant } from "../../adapters/foundry/actors/resolve-opposed-check-participant";
import { dispatchOpposedCheckResult } from "../../adapters/foundry/chat/opposed-check-result-query";
import { showDiceAnimationIfAvailable } from "../../adapters/foundry/dice/show-dice-animation-if-available";
import { OPPOSED_CHECK_STATE_FLAG, SYSTEM_ID } from "../../config/system-config";
import { resolveAgentCheckInteraction } from "./resolve-agent-check-interaction";

function getMessage(id: string): ChatMessage | null {
  const foundryGame = game as typeof game & {
    readonly messages?: { get(id: string): ChatMessage | undefined };
  };
  return foundryGame.messages?.get(id) ?? null;
}

export type RollOpposedCheckSideOutcome = "canceled" | "submitted";

export async function rollOpposedCheckSide(
  messageId: string,
  side: OpposedCheckSide,
): Promise<RollOpposedCheckSideOutcome> {
  const message = getMessage(messageId);
  if (!message) throw new Error("Opposed Check message no longer exists.");
  const state = parseOpposedCheckState(message.getFlag(SYSTEM_ID, OPPOSED_CHECK_STATE_FLAG));
  if (!state) throw new Error("Opposed Check state is invalid.");
  const sideState = state[side];
  if (sideState.result) throw new Error("This Opposed Check side has already rolled.");
  const actor = await resolveOpposedCheckParticipant(sideState.participant);
  if (!actor) throw new Error("Opposed Check participant is no longer available.");
  const resolved = await resolveAgentCheckInteraction(actor, sideState.selection, { allowDifficulty: false });
  if (!resolved) return "canceled";
  await showDiceAnimationIfAvailable(resolved.execution.roll);
  await dispatchOpposedCheckResult({
    messageId,
    side,
    result: createCheckSnapshot(resolved.execution.result),
  });
  return "submitted";
}
