import { expect, it } from "vitest";
import { createUnlockState, submitUnlockGuess } from "../../core/access-challenges/unlock";
import { projectPlayerSession, type AccessChallengeSession } from "./session";

it("projects only latest Unlock feedback and never sends the secret or complete history", () => {
  const first = submitUnlockGuess(createUnlockState([3, 5, 2], 6, 4, 6), [4, 5, 1]);
  const state = submitUnlockGuess(first, [2, 5, 4]);
  const session: AccessChallengeSession = { id: "s", gmUserId: "gm",
    participant: { kind: "token", uuid: "Scene.scene.Token.token" }, participantName: "Agent", participantImg: "img",
    obstacle: "Porta", revision: 2, type: "unlock", state };
  const projection = projectPlayerSession(session);
  expect(projection.type).toBe("unlock");
  expect(projection).toMatchObject({ gmUserId: "gm", latest: { guess: [2, 5, 4], feedback: ["high", "exact", "low"] } });
  expect(JSON.stringify(projection)).not.toContain('"secret"');
  expect(JSON.stringify(projection)).not.toContain('"history"');
  expect(JSON.stringify(projection)).not.toContain('[3,5,2]');
});
