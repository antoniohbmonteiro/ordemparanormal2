import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ canRoll: vi.fn(), resolve: vi.fn(), roll: vi.fn(), lifecycle: vi.fn() }));
vi.mock("../../adapters/foundry/actors/agent-check-permission", () => ({ canUserRollActor: mocks.canRoll }));
vi.mock("../../adapters/foundry/actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: mocks.resolve }));
vi.mock("../../features/checks/roll-check-request", () => ({ rollCheckRequest: mocks.roll }));
vi.mock("../../adapters/foundry/chat/read-check-request-message", () => ({ readCheckRequestMessageLifecycle: mocks.lifecycle }));

import { activateCheckRequestChatController } from "./check-request-chat-controller";

const state = {
  schemaVersion: 1 as const,
  status: "pending" as const,
  participant: { kind: "actor" as const, uuid: "Actor.agent" as const },
  selection: { kind: "skill" as const, key: "fighting" as const },
  presentation: { actorName: "Agente", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
};

describe("Check Request chat controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("game", { user: {}, i18n: { localize: (key: string) => key.endsWith("Rolling") ? "Rolando…" : "Rolar" } });
    vi.stubGlobal("ui", { notifications: { error: vi.fn() } });
    mocks.resolve.mockResolvedValue({});
    mocks.canRoll.mockReturnValue(true);
    mocks.roll.mockResolvedValue("canceled");
    mocks.lifecycle.mockReturnValue({ state });
  });

  it("projects the action only for an authorized user", async () => {
    const button = { dataset: {} as Record<string, string>, disabled: false, textContent: "", addEventListener: vi.fn() };
    const container = { replaceChildren: vi.fn() };
    const root = {
      ownerDocument: { createElement: vi.fn(() => button) },
      querySelector: vi.fn(() => container),
    } as unknown as HTMLElement;
    await activateCheckRequestChatController({ id: "message" } as ChatMessage, root, state);
    expect(container.replaceChildren).toHaveBeenCalledExactlyOnceWith(button);

    mocks.canRoll.mockReturnValue(false);
    const denied = { replaceChildren: vi.fn() };
    await activateCheckRequestChatController(
      {} as ChatMessage,
      { ownerDocument: root.ownerDocument, querySelector: () => denied } as unknown as HTMLElement,
      state,
    );
    expect(denied.replaceChildren).not.toHaveBeenCalled();
  });
});
