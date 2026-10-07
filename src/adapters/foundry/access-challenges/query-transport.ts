import { SYSTEM_ID } from "../../../config/system-config";
import { projectPlayerSession, type AccessChallengeSession } from "../../../application/access-challenges/session";
import type { PlayerAction, PlayerActionResult } from "../../../features/access-challenges/access-challenge-service";
import { activeChallengeOwners, activeChallengePlayers } from "./challenge-owners";

export const ACCESS_PRESENT_QUERY = `${SYSTEM_ID}.accessChallengePresent`;
export const ACCESS_UPDATE_QUERY = `${SYSTEM_ID}.accessChallengeUpdate`;
export const ACCESS_CLOSE_QUERY = `${SYSTEM_ID}.accessChallengeClose`;
export const ACCESS_ACTION_QUERY = `${SYSTEM_ID}.accessChallengeAction`;

function userById(id: string): foundry.documents.User | undefined {
  return (game.users as typeof game.users & { get(id: string): foundry.documents.User | undefined }).get(id);
}

async function sendProjection(session: AccessChallengeSession, query: string, timeout: number): Promise<void> {
  const owners = await activeChallengeOwners(session.participant);
  const projection = projectPlayerSession(session);
  const results = await Promise.allSettled(owners.map(user => user.query(query, projection, { timeout })));
  if (results.some(result => result.status === "rejected")) throw new Error(game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.UpdatePlayers"));
}

export async function presentChallengeToPlayers(session: AccessChallengeSession): Promise<void> {
  await sendProjection(session, ACCESS_PRESENT_QUERY, 10000);
}

export async function presentChallengeToUser(session: AccessChallengeSession, user: foundry.documents.User): Promise<void> {
  await user.query(ACCESS_PRESENT_QUERY, projectPlayerSession(session), { timeout: 10000 });
}

export async function updateChallengeForPlayers(session: AccessChallengeSession): Promise<void> {
  await sendProjection(session, ACCESS_UPDATE_QUERY, 3000);
}

export async function closeChallengeForPlayers(session: AccessChallengeSession): Promise<void> {
  const users = activeChallengePlayers();
  const results = await Promise.allSettled(users.map(user => user.query(ACCESS_CLOSE_QUERY,
    { id: session.id, gmUserId: session.gmUserId }, { timeout: 5000 })));
  if (results.some(result => result.status === "rejected")) throw new Error(game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.ClosePlayers"));
}

export async function dispatchChallengeAction(gmUserId: string, action: PlayerAction): Promise<PlayerActionResult> {
  const gm = userById(gmUserId);
  if (!gm?.active) throw new Error(game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.GmUnavailableShort"));
  return gm.query(ACCESS_ACTION_QUERY, action, { timeout: 20000 }) as Promise<PlayerActionResult>;
}
