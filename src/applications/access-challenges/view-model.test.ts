import { expect, it } from "vitest";
import translations from "../../../lang/pt-BR.json";

const localize = (key: string): string => {
  const value = key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], translations);
  if (typeof value !== "string") throw new Error(`Missing localization: ${key}`);
  return value;
};
import { createUnlockState, submitUnlockGuess } from "../../core/access-challenges/unlock";
import { projectPlayerSession, type AccessChallengeSession } from "../../application/access-challenges/session";
import { buildGmChallengeContext, buildPlayerChallengeContext } from "./view-model";

const session: AccessChallengeSession = { id: "s", gmUserId: "gm", participant: { kind: "actor", uuid: "Actor.agent" },
  participantName: "Agent", participantImg: "agent.png", obstacle: "", revision: 0, type: "unlock",
  state: createUnlockState([3, 5, 2], 6, 3, 6) };

function unlock(context: ReturnType<typeof buildPlayerChallengeContext>) {
  if (!("unlock" in context)) throw new Error("Expected Unlock context.");
  return context.unlock;
}

it("keeps the initial CTA disabled until every slot has a valid selected value", () => {
  const projection = projectPlayerSession(session);
  expect(unlock(buildPlayerChallengeContext(projection, [], false, "", "", localize)).canAct).toBe(false);
  expect(unlock(buildPlayerChallengeContext(projection, [3, 0, 2], false, "", "", localize)).canAct).toBe(false);
  expect(unlock(buildPlayerChallengeContext(projection, [3, 5, 2], false, "", "", localize)).canAct).toBe(true);
});

it("presents canonical feedback symbols and terminal slots without chevrons", () => {
  const active = { ...session, state: submitUnlockGuess(session.state, [4, 5, 1]) };
  const context = buildPlayerChallengeContext(projectPlayerSession(active), [4, 5, 1], false, "", "", localize);
  expect(unlock(context).slots.map(slot => [slot.feedbackLabel, slot.feedbackSymbol])).toEqual([["BAIXO", "▼"], ["EXATO", "✓"], ["ALTO", "▲"]]);
  const success = { ...session, state: submitUnlockGuess(session.state, [3, 5, 2]) };
  const completed = buildPlayerChallengeContext(projectPlayerSession(success), [3, 5, 2], false, "", "", localize);
  expect(completed.succeeded).toBe(true);
  expect(unlock(completed).slots.every(slot => slot.disabled && !slot.showChevron)).toBe(true);
  expect(buildGmChallengeContext(success, false, localize)).toMatchObject({ terminal: true, canCancel: false });
});
