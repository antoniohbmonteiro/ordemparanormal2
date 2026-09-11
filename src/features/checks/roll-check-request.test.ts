import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lifecycle: vi.fn(),
  resolveParticipant: vi.fn(),
  resolveInteraction: vi.fn(),
  animate: vi.fn(),
  snapshot: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("../../adapters/foundry/chat/read-check-request-message", () => ({ readCheckRequestMessageLifecycle: mocks.lifecycle }));
vi.mock("../../adapters/foundry/actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: mocks.resolveParticipant }));
vi.mock("./resolve-agent-check-interaction", () => ({ resolveAgentCheckInteraction: mocks.resolveInteraction }));
vi.mock("../../adapters/foundry/dice/show-dice-animation-if-available", () => ({ showDiceAnimationIfAvailable: mocks.animate }));
vi.mock("../../application/checks/check-snapshot", () => ({ createCheckSnapshot: mocks.snapshot }));
vi.mock("../../adapters/foundry/chat/check-request-result-query", () => ({ dispatchCheckRequestResult: mocks.dispatch }));

import { rollCheckRequest } from "./roll-check-request";

const baseState = {
  schemaVersion: 1,
  status: "pending",
  participant: { kind: "actor", uuid: "Actor.agent" },
  selection: { kind: "skill", key: "fighting" },
  presentation: { actorName: "Agente", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
};

describe("roll Check Request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("game", { messages: { get: vi.fn(() => ({})) } });
    mocks.resolveParticipant.mockResolvedValue({});
    mocks.lifecycle.mockReturnValue({ state: baseState });
    mocks.resolveInteraction.mockResolvedValue({ execution: { roll: {}, result: {} } });
    mocks.animate.mockResolvedValue(undefined);
    mocks.snapshot.mockReturnValue({ schemaVersion: 3 });
    mocks.dispatch.mockResolvedValue(undefined);
  });

  it("hides DT when the GM did not define one and submits no message", async () => {
    await expect(rollCheckRequest("message")).resolves.toBe("submitted");
    expect(mocks.resolveInteraction).toHaveBeenCalledWith({}, baseState.selection, { allowDifficulty: false });
    expect(mocks.animate).toHaveBeenCalledOnce();
    expect(mocks.dispatch).toHaveBeenCalledWith({ messageId: "message", result: { schemaVersion: 3 } });
    expect(globalThis).not.toHaveProperty("ChatMessage");
  });

  it("locks the GM-defined DT while retaining the normal interaction", async () => {
    const state = { ...baseState, difficulty: 12 };
    mocks.lifecycle.mockReturnValue({ state });
    mocks.resolveInteraction.mockResolvedValue({
      execution: { roll: {}, result: {} },
      difficultyResolution: { difficulty: 12, outcome: "success" },
    });
    await rollCheckRequest("message");
    expect(mocks.resolveInteraction).toHaveBeenCalledWith({}, state.selection, { lockedDifficulty: 12 });
    expect(mocks.snapshot).toHaveBeenCalledWith({}, { difficulty: 12, outcome: "success" });
  });

  it("does not animate or submit when the normal dialog is canceled", async () => {
    mocks.resolveInteraction.mockResolvedValue(null);
    await expect(rollCheckRequest("message")).resolves.toBe("canceled");
    expect(mocks.animate).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
