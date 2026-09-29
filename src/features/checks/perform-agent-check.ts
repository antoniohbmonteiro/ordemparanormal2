import type { AgentCheckSelection } from "../../application/checks/build-agent-check";
import { getCurrentMessageMode, publishCheckMessage } from "../../adapters/foundry/chat/publish-check-message";
import { resolveAgentCheckInteraction } from "./resolve-agent-check-interaction";
import { createCheckSnapshot, type CheckSnapshotV4 } from "../../application/checks/check-snapshot";
export { AgentCheckPermissionError } from "./resolve-agent-check-interaction";

export async function performAgentCheck(
  actor: foundry.documents.Actor,
  selection: AgentCheckSelection,
): Promise<void> {
  const resolved = await resolveAgentCheckInteraction(actor, selection);
  if (!resolved) return;
  if (resolved.appliedAbilityUses.length > 0) {
    await publishCheckMessage(actor, resolved.execution, resolved.difficultyResolution, resolved.appliedAbilityUses);
  } else {
    await publishCheckMessage(actor, resolved.execution, resolved.difficultyResolution);
  }
}

export interface PublishedAgentCheck {
  readonly messageId: string;
  readonly snapshot: CheckSnapshotV4;
}

export async function performAgentCheckWithResult(
  actor: foundry.documents.Actor,
  selection: AgentCheckSelection,
): Promise<PublishedAgentCheck | null> {
  const resolved = await resolveAgentCheckInteraction(actor, selection);
  if (!resolved) return null;
  const currentMode = getCurrentMessageMode();
  const messageMode = ["public", "gm", "blind"].includes(currentMode) ? currentMode : "gm";
  const message = await publishCheckMessage(actor, resolved.execution, resolved.difficultyResolution, resolved.appliedAbilityUses, messageMode);
  if (!message || typeof message !== "object" || !("id" in message) || typeof message.id !== "string")
    throw new Error("Check message was not created.");
  return { messageId: message.id,
    snapshot: createCheckSnapshot(resolved.execution.result, resolved.difficultyResolution, resolved.appliedAbilityUses) };
}
