import { describe, expect, it } from "vitest";
import { parseCheckRequestState } from "./check-request-state";

const valid = {
  schemaVersion: 1,
  status: "pending",
  participant: { kind: "actor", uuid: "Actor.agent" },
  selection: { kind: "skill", key: "fighting" },
  difficulty: 12,
  presentation: {
    actorName: "Agente",
    requestedCheckLabel: "Luta",
    requestedCheckContext: "Físico + Luta",
  },
};

describe("Check Request state", () => {
  it("parses a versioned skill-only state without Foundry globals", () => {
    expect(parseCheckRequestState(valid)).toEqual(valid);
    expect(globalThis).not.toHaveProperty("game");
  });

  it.each([
    { ...valid, selection: { kind: "attribute", key: "physical" } },
    { ...valid, selection: { kind: "aptitude", key: "arts" } },
    { ...valid, difficulty: 0 },
    { ...valid, forged: true },
    { ...valid, participant: { ...valid.participant, forged: true } },
  ])("rejects invalid or expanded Request state", (state) => {
    expect(parseCheckRequestState(state)).toBeNull();
  });
});
