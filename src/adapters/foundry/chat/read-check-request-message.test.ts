import { describe, expect, it } from "vitest";
import type { CheckSnapshotV3 } from "../../../application/checks/check-snapshot";
import { doesSnapshotMatchCheckRequest, readCheckRequestMessageLifecycle } from "./read-check-request-message";

const state = {
  schemaVersion: 1 as const,
  status: "pending" as const,
  participant: { kind: "actor" as const, uuid: "Actor.agent" as const },
  selection: { kind: "skill" as const, key: "fighting" as const },
  difficulty: 9,
  presentation: { actorName: "Agente", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
};
const snapshot: CheckSnapshotV3 = {
  schemaVersion: 3,
  check: { kind: "skill", key: "fighting", name: "Luta" },
  components: [
    { kind: "attribute", key: "mind", label: "Mente", die: 8, result: 5 },
    { kind: "skill", key: "fighting", label: "Luta", die: 6, result: 4 },
  ],
  extraDice: [],
  total: 9,
  difficulty: 9,
  outcome: "success",
};

function message(request: unknown, check?: unknown): ChatMessage {
  return { getFlag: (_scope: string, key: string) => key === "checkRequest" ? request : check } as unknown as ChatMessage;
}

describe("Check Request message lifecycle", () => {
  it("accepts pending only while the normal snapshot is absent", () => {
    expect(readCheckRequestMessageLifecycle(message(state))?.state.status).toBe("pending");
    expect(readCheckRequestMessageLifecycle(message(state, snapshot))).toBeNull();
  });

  it("accepts resolved only with a matching normal V3 snapshot", () => {
    const resolved = { ...state, status: "resolved" as const };
    expect(readCheckRequestMessageLifecycle(message(resolved, snapshot))).toMatchObject({ snapshot });
    expect(readCheckRequestMessageLifecycle(message(resolved))).toBeNull();
  });

  it("permits an alternate attribute but enforces Skill and DT provenance", () => {
    expect(doesSnapshotMatchCheckRequest(snapshot, state)).toBe(true);
    expect(doesSnapshotMatchCheckRequest({ ...snapshot, difficulty: 10 }, state)).toBe(false);
    expect(doesSnapshotMatchCheckRequest({ ...snapshot, outcome: "failure" }, state)).toBe(false);
    expect(doesSnapshotMatchCheckRequest({ ...snapshot, check: { ...snapshot.check, key: "research" } }, state)).toBe(false);
    const withoutDifficulty = { ...state, difficulty: undefined };
    expect(doesSnapshotMatchCheckRequest(snapshot, withoutDifficulty)).toBe(false);
    const { difficulty: _difficulty, outcome: _outcome, ...noDtSnapshot } = snapshot;
    expect(doesSnapshotMatchCheckRequest(noDtSnapshot, withoutDifficulty)).toBe(true);
  });
});
