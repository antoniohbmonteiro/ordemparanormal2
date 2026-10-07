import { isActiveSession } from "../../application/access-challenges/session";
import { resolveAgentCheckParticipant } from "../../adapters/foundry/actors/resolve-agent-check-participant";
import { canUserOperateChallenge } from "../../adapters/foundry/access-challenges/challenge-owners";
import { presentChallengeToUser } from "../../adapters/foundry/access-challenges/query-transport";
import { activeAccessChallenges, gmAccessChallenge } from "./access-challenge-service";

export async function presentActiveChallengesToUser(user: foundry.documents.User): Promise<void> {
  if (!game.user.isGM || !user.active || user.isGM) return;
  const results = await Promise.allSettled(activeAccessChallenges().map(async session => {
    const actor = await resolveAgentCheckParticipant(session.participant);
    const current = gmAccessChallenge(session.id);
    if (!game.user.isGM || !current || !isActiveSession(current) || !actor || !canUserOperateChallenge(actor, user)) return;
    await presentChallengeToUser(current, user);
  }));
  for (const result of results) {
    if (result.status === "rejected") console.warn("ordemparanormal2 | Access Challenge presentation on User connection failed.", result.reason);
  }
}
