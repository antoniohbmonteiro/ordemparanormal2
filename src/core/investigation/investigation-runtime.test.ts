import { describe, expect, it } from "vitest";
import { advanceInvestigationRound, readInvestigationRuntime, setAgentActed, startInvestigation } from "./investigation-runtime";

describe("investigation runtime", () => {
  it("starts in round one and clears only acted Agents on advance", () => {
    const started = startInvestigation("run-1");
    const acted = setAgentActed(started, "Actor.a", true);
    const succeeded = { ...acted, recapSuccessActorUuid: "Actor.a" };
    expect(advanceInvestigationRound(succeeded)).toEqual({
      schemaVersion: 1, runId: "run-1", round: 2, actedAgentUuids: [], recapSuccessActorUuid: "Actor.a",
    });
    expect(started.actedAgentUuids).toEqual([]);
  });

  it("deduplicates persisted Agent UUIDs and rejects malformed runtime", () => {
    expect(readInvestigationRuntime({ schemaVersion: 1, runId: "run-1", round: 1,
      actedAgentUuids: ["Actor.a", "Actor.a"] })?.actedAgentUuids).toEqual(["Actor.a"]);
    expect(readInvestigationRuntime({ schemaVersion: 1, runId: "run-1", round: 0,
      actedAgentUuids: [] })).toBeNull();
  });

  it("preserves the Share lock, pending award, and claimed clue across rounds", () => {
    const runtime = readInvestigationRuntime({ schemaVersion: 1, runId: "run-1", round: 2,
      actedAgentUuids: ["Actor.a"], shareSuccessActorUuid: "Actor.a", shareSuccessMessageId: "check-1",
      shareCluePending: true, shareClueGrant: { kind: "new", clueId: "award-id", text: "Pista",
        recipientActorUuids: ["Actor.b"] } });
    expect(runtime?.shareCluePending).toBe(true);
    expect(advanceInvestigationRound(runtime!)).toMatchObject({ round: 3, actedAgentUuids: [],
      shareSuccessActorUuid: "Actor.a", shareSuccessMessageId: "check-1", shareCluePending: true,
      shareClueGrant: { clueId: "award-id" } });
    expect(readInvestigationRuntime({ schemaVersion: 1, runId: "run-1", round: 1,
      actedAgentUuids: [], shareCluePending: true })).toBeNull();
  });
});
