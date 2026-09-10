import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildCheck: vi.fn(),
  createMessage: vi.fn(),
  readSource: vi.fn(),
  resolveParticipant: vi.fn(),
}));

vi.mock("../../application/checks/build-agent-check", () => ({ buildAgentCheck: mocks.buildCheck }));
vi.mock("../../adapters/foundry/actors/read-agent-check-source", () => ({ readAgentCheckSource: mocks.readSource }));
vi.mock("../../adapters/foundry/actors/resolve-opposed-check-participant", () => ({ resolveOpposedCheckParticipant: mocks.resolveParticipant }));
vi.mock("../../adapters/foundry/chat/create-opposed-check-message", () => ({ createOpposedCheckMessage: mocks.createMessage }));

import { createOpposedCheck } from "./create-opposed-check";

describe("create Opposed Check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("game", { user: { isGM: true }, i18n: { localize: (key: string) => key } });
    mocks.resolveParticipant
      .mockResolvedValueOnce({ name: "Victor", img: "victor.webp" })
      .mockResolvedValueOnce({ name: "Edgar", img: "edgar.webp" });
    mocks.readSource.mockReturnValue({});
    mocks.buildCheck.mockReturnValue({
      check: { kind: "skill", key: "fighting", name: "Luta" },
      components: [
        { kind: "attribute", key: "physical", label: "Físico", die: 8 },
        { kind: "skill", key: "fighting", label: "Luta", die: 6 },
      ],
      extraDice: [],
    });
    mocks.createMessage.mockResolvedValue({ id: "message" });
  });

  it("captures minimal requested presentation and delegates one message creation", async () => {
    await createOpposedCheck({
      left: { participant: { kind: "actor", uuid: "Actor.left" }, selection: { kind: "skill", key: "fighting" } },
      right: { participant: { kind: "token", uuid: "Scene.scene.Token.right" }, selection: { kind: "skill", key: "fighting" } },
    });
    expect(mocks.createMessage).toHaveBeenCalledOnce();
    expect(mocks.createMessage).toHaveBeenCalledWith({
      schemaVersion: 1,
      left: expect.objectContaining({ presentation: {
        name: "Victor", img: "victor.webp", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta",
      } }),
      right: expect.objectContaining({ presentation: {
        name: "Edgar", img: "edgar.webp", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta",
      } }),
    });
  });

  it("fails before creating a message when a participant disappeared", async () => {
    mocks.resolveParticipant.mockReset().mockResolvedValue(null);
    await expect(createOpposedCheck({
      left: { participant: { kind: "actor", uuid: "Actor.left" }, selection: { kind: "skill", key: "fighting" } },
      right: { participant: { kind: "actor", uuid: "Actor.right" }, selection: { kind: "skill", key: "fighting" } },
    })).rejects.toThrow("no longer available");
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });
});
