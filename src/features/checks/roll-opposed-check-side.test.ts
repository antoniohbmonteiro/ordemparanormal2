import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpposedCheckStateV1 } from "../../application/checks/opposed-check-state";

const mocks = vi.hoisted(() => ({
  animate: vi.fn(),
  createSnapshot: vi.fn(),
  dispatch: vi.fn(),
  resolveInteraction: vi.fn(),
  resolveParticipant: vi.fn(),
}));

vi.mock("../../application/checks/check-snapshot", () => ({ createCheckSnapshot: mocks.createSnapshot }));
vi.mock("../../adapters/foundry/actors/resolve-opposed-check-participant", () => ({
  resolveOpposedCheckParticipant: mocks.resolveParticipant,
}));
vi.mock("../../adapters/foundry/chat/opposed-check-result-query", () => ({
  dispatchOpposedCheckResult: mocks.dispatch,
}));
vi.mock("../../adapters/foundry/dice/show-dice-animation-if-available", () => ({
  showDiceAnimationIfAvailable: mocks.animate,
}));
vi.mock("./resolve-agent-check-interaction", () => ({ resolveAgentCheckInteraction: mocks.resolveInteraction }));

import { rollOpposedCheckSide } from "./roll-opposed-check-side";

const state: OpposedCheckStateV1 = {
  schemaVersion: 1,
  left: {
    participant: { kind: "actor", uuid: "Actor.left" },
    selection: { kind: "skill", key: "fighting" },
    presentation: { name: "Victor", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
  },
  right: {
    participant: { kind: "actor", uuid: "Actor.right" },
    selection: { kind: "skill", key: "fighting" },
    presentation: { name: "Edgar", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
  },
};

describe("roll Opposed Check side", () => {
  const roll = {} as foundry.dice.Roll;
  const result = {
    check: { kind: "skill", key: "fighting", name: "Luta" },
    components: [
      { kind: "attribute", key: "mind", label: "Mente", die: 8, result: 5 },
      { kind: "skill", key: "fighting", label: "Luta", die: 6, result: 4 },
    ],
    extraDice: [],
    total: 9,
  };
  const snapshot = { ...result, schemaVersion: 3 };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("game", {
      messages: { get: vi.fn(() => ({ getFlag: vi.fn(() => state) })) },
    });
    mocks.resolveParticipant.mockResolvedValue({});
    mocks.animate.mockResolvedValue(undefined);
    mocks.createSnapshot.mockReturnValue(snapshot);
    mocks.dispatch.mockResolvedValue(undefined);
    mocks.resolveInteraction.mockResolvedValue({
      execution: {
        roll,
        result,
      },
    });
  });

  it("uses the persisted selection, disables DT, and submits a snapshot without publishing", async () => {
    await expect(rollOpposedCheckSide("message", "left")).resolves.toBe("submitted");
    expect(mocks.resolveInteraction).toHaveBeenCalledExactlyOnceWith(
      {},
      { kind: "skill", key: "fighting" },
      { allowDifficulty: false },
    );
    expect(mocks.animate).toHaveBeenCalledExactlyOnceWith(roll);
    expect(mocks.createSnapshot).toHaveBeenCalledExactlyOnceWith(result);
    expect(mocks.dispatch).toHaveBeenCalledWith({
      messageId: "message",
      side: "left",
      result: snapshot,
    });
  });

  it("waits for animation before creating and submitting the snapshot", async () => {
    let finishAnimation: (() => void) | undefined;
    mocks.animate.mockImplementation(
      () => new Promise<void>((resolve) => {
        finishAnimation = resolve;
      }),
    );

    const pending = rollOpposedCheckSide("message", "left");
    await vi.waitFor(() => expect(mocks.animate).toHaveBeenCalledWith(roll));

    expect(mocks.createSnapshot).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();

    finishAnimation?.();
    await pending;

    expect(mocks.resolveInteraction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.animate.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.animate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createSnapshot.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.createSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.dispatch.mock.invocationCallOrder[0] as number,
    );
  });

  it("does not submit when the Check Dialog is canceled", async () => {
    mocks.resolveInteraction.mockResolvedValue(null);
    await expect(rollOpposedCheckSide("message", "left")).resolves.toBe("canceled");
    expect(mocks.animate).not.toHaveBeenCalled();
    expect(mocks.createSnapshot).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
