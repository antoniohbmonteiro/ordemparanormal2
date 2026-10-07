import { presentActiveChallengesToUser } from "../features/access-challenges/access-challenge-presence";
import { SYSTEM_ID } from "../config/system-config";

export function registerAccessChallengePresence(): void {
  Hooks.on("userConnected", (user: unknown, connected: unknown) => {
    if (connected !== true) return;
    return presentActiveChallengesToUser(user as foundry.documents.User).catch(error => {
      console.error(`${SYSTEM_ID} | Failed to present Access Challenges on User connection.`, error);
    });
  });
}
