import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckSnapshotV3 } from "../../application/checks/check-snapshot";
import type { OpposedCheckStateV1 } from "../../application/checks/opposed-check-state";

const mocks = vi.hoisted(() => ({
  canRoll: vi.fn(),
  render: vi.fn(),
  resolveParticipant: vi.fn(),
}));

vi.mock("../../adapters/foundry/actors/agent-check-permission", () => ({ canUserRollActor: mocks.canRoll }));
vi.mock("../../adapters/foundry/actors/resolve-opposed-check-participant", () => ({ resolveOpposedCheckParticipant: mocks.resolveParticipant }));
vi.mock("../../adapters/foundry/chat/create-opposed-check-message", () => ({ renderOpposedCheckContent: mocks.render }));

import { parseSubmitOpposedCheckResultData, submitOpposedCheckResult } from "./submit-opposed-check-result";

const result: CheckSnapshotV3 = {
  schemaVersion: 3,
  check: { kind: "skill", key: "fighting", name: "Luta" },
  components: [
    { kind: "attribute", key: "mind", label: "Mente", die: 8, result: 5 },
    { kind: "skill", key: "fighting", label: "Luta", die: 6, result: 4 },
  ],
  extraDice: [],
  total: 9,
};

function createState(): OpposedCheckStateV1 {
  const side = (uuid: `Actor.${string}`, name: string) => ({
    participant: { kind: "actor" as const, uuid },
    selection: { kind: "skill" as const, key: "fighting" as const },
    presentation: { name, requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
  });
  return { schemaVersion: 1, left: side("Actor.left", "Victor"), right: side("Actor.right", "Edgar") };
}

describe("submit Opposed Check result", () => {
  let state: OpposedCheckStateV1;
  let update: ReturnType<typeof vi.fn>;
  let message: ChatMessage;
  const activeGM = { id: "gm", isGM: true } as foundry.documents.User;
  const sender = { id: "player", isGM: false } as foundry.documents.User;
  const canonicalSender = { id: "player", isGM: false } as foundry.documents.User;

  beforeEach(() => {
    vi.clearAllMocks();
    state = createState();
    update = vi.fn(async (changes: Record<string, unknown>) => {
      state = (changes["flags.ordemparanormal2.opposedCheck"] ?? state) as OpposedCheckStateV1;
    });
    message = {
      getFlag: vi.fn((_scope: string, key: string) => key === "cardPresentation" ? { card: "opposedCheck" } : state),
      update,
    } as unknown as ChatMessage;
    vi.stubGlobal("game", {
      user: activeGM,
      users: { activeGM, get: vi.fn((id: string) => id === "player" ? canonicalSender : activeGM) },
      messages: { get: vi.fn(() => message) },
    });
    mocks.resolveParticipant.mockResolvedValue({});
    mocks.canRoll.mockReturnValue(true);
    mocks.render.mockResolvedValue("<article>updated</article>");
  });

  it("rejects identity fields in the client payload", () => {
    expect(parseSubmitOpposedCheckResultData({ messageId: "m", side: "left", result, userId: "forged" })).toBeNull();
    expect(parseSubmitOpposedCheckResultData({ messageId: "m", side: "left", result, sender: sender })).toBeNull();
  });

  it("re-resolves the canonical sender and updates content plus state once", async () => {
    await submitOpposedCheckResult({ messageId: "m", side: "left", result }, sender);
    expect(mocks.canRoll).toHaveBeenCalledWith({}, canonicalSender);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      content: "<article>updated</article>",
      "flags.ordemparanormal2.opposedCheck": expect.objectContaining({
        left: expect.objectContaining({ result }),
      }),
    }));
  });

  it("rejects a non-owner even when a client submits a structurally valid snapshot", async () => {
    mocks.canRoll.mockReturnValue(false);
    await expect(submitOpposedCheckResult({ messageId: "m", side: "left", result }, sender)).rejects.toThrow("cannot roll");
    expect(update).not.toHaveBeenCalled();
  });

  it("serializes competing submissions so the first valid result wins", async () => {
    const submissions = await Promise.allSettled([
      submitOpposedCheckResult({ messageId: "m", side: "left", result }, sender),
      submitOpposedCheckResult({ messageId: "m", side: "left", result }, sender),
    ]);
    expect(submissions.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(update).toHaveBeenCalledOnce();
  });

  it("stores both sides through two updates of the same message", async () => {
    await submitOpposedCheckResult({ messageId: "m", side: "left", result }, sender);
    await submitOpposedCheckResult({ messageId: "m", side: "right", result }, sender);
    expect(update).toHaveBeenCalledTimes(2);
    expect(state.left.result).toEqual(result);
    expect(state.right.result).toEqual(result);
  });
});
