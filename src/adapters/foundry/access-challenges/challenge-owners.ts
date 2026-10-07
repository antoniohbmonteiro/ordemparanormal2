import type { AgentCheckParticipantReference } from "../../../application/checks/agent-check-participant";
import { resolveAgentCheckParticipant } from "../actors/resolve-agent-check-participant";

export function canUserOperateChallenge(actor: foundry.documents.Actor, user: foundry.documents.User): boolean {
  return user.active && !user.isGM && actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
}

export function activeChallengePlayers(): readonly foundry.documents.User[] {
  const users = game.users as typeof game.users & { contents: readonly foundry.documents.User[] };
  return users.contents.filter(user => user.active && !user.isGM);
}

export async function activeChallengeOwners(participant: AgentCheckParticipantReference): Promise<readonly foundry.documents.User[]> {
  const actor = await resolveAgentCheckParticipant(participant);
  if (!actor) return [];
  return activeChallengePlayers().filter(user => canUserOperateChallenge(actor, user));
}
