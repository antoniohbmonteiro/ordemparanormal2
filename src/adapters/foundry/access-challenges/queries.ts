import type { PlayerProjection } from "../../../application/access-challenges/session";
import { gmAccessChallenge, submitPlayerAction, type PlayerAction } from "../../../features/access-challenges/access-challenge-service";
import { closePlayerChallengeView, presentPlayerChallengeView, updatePlayerChallengeView } from "../../../applications/access-challenges/player-view";
import { ACCESS_ACTION_QUERY, ACCESS_CLOSE_QUERY, ACCESS_PRESENT_QUERY, ACCESS_UPDATE_QUERY, updateChallengeForPlayers } from "./query-transport";
import { resolveAgentCheckParticipant } from "../actors/resolve-agent-check-participant";
import { canUserOperateChallenge } from "./challenge-owners";

interface QueryContext { readonly user: foundry.documents.User }

export function registerAccessChallengeQueries(): void {
  const queries = (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries;
  queries[ACCESS_ACTION_QUERY] = async (data: PlayerAction, context: QueryContext) => {
    const result = await submitPlayerAction(data, context.user);
    if (result.status === "ok") {
      const session = gmAccessChallenge(data.id);
      if (session) void updateChallengeForPlayers(session).catch(error => {
        console.warn("ordemparanormal2 | Access Challenge Player update failed.", error);
      });
    }
    return result;
  };
  const present = (open: boolean) => async (data: PlayerProjection, context: QueryContext) => {
    if (!data || typeof data.id !== "string" || data.gmUserId !== context.user.id || !context.user.isGM) return false;
    const actor = await resolveAgentCheckParticipant(data.participant);
    if (!actor || !canUserOperateChallenge(actor, game.user)) {
      await closePlayerChallengeView(data.id, context.user.id);
      return false;
    }
    if (open) await presentPlayerChallengeView(data);
    else await updatePlayerChallengeView(data);
    return true;
  };
  queries[ACCESS_PRESENT_QUERY] = present(true);
  queries[ACCESS_UPDATE_QUERY] = present(false);
  queries[ACCESS_CLOSE_QUERY] = async (data: { id?: unknown; gmUserId?: unknown }, context: QueryContext) => {
    if (!data || typeof data.id !== "string" || data.gmUserId !== context.user.id || !context.user.isGM) return false;
    await closePlayerChallengeView(data.id, context.user.id);
    return true;
  };
}
