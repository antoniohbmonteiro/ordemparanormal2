import type { AgentCheckSelection } from "../../application/checks/build-agent-check";
import { publishCheckMessage } from "../../adapters/foundry/chat/publish-check-message";
import { resolveAgentCheckInteraction } from "./resolve-agent-check-interaction";
export { AgentCheckPermissionError } from "./resolve-agent-check-interaction";

export async function performAgentCheck(
  actor: foundry.documents.Actor,
  selection: AgentCheckSelection,
): Promise<void> {
  const resolved = await resolveAgentCheckInteraction(actor, selection);
  if (!resolved) return;
  await publishCheckMessage(actor, resolved.execution, resolved.difficultyResolution);
}
