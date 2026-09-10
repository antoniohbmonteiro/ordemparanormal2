import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpposedCheckStateV1 } from "../../application/checks/opposed-check-state";

const mocks = vi.hoisted(() => ({
  canRoll: vi.fn(),
  resolveParticipant: vi.fn(),
  rollSide: vi.fn(),
}));

vi.mock("../../adapters/foundry/actors/agent-check-permission", () => ({ canUserRollActor: mocks.canRoll }));
vi.mock("../../adapters/foundry/actors/resolve-opposed-check-participant", () => ({
  resolveOpposedCheckParticipant: mocks.resolveParticipant,
}));
vi.mock("../../features/checks/roll-opposed-check-side", () => ({ rollOpposedCheckSide: mocks.rollSide }));

import { activateOpposedCheckChatController } from "./opposed-check-chat-controller";

function state(): OpposedCheckStateV1 {
  const side = (uuid: `Actor.${string}`, name: string) => ({
    participant: { kind: "actor" as const, uuid },
    selection: { kind: "skill" as const, key: "fighting" as const },
    presentation: { name, requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
  });
  return { schemaVersion: 1, left: side("Actor.left", "Victor"), right: side("Actor.right", "Edgar") };
}

describe("Opposed Check chat controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("game", {
      user: {},
      i18n: {
        localize: (key: string) => key.endsWith(".Rolling") ? "Rolando…" : "Rolar",
      },
    });
    vi.stubGlobal("ui", { notifications: { error: vi.fn() } });
    mocks.rollSide.mockResolvedValue("canceled");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("projects an authorized button and restores it when the dialog is canceled", async () => {
    const currentState = state();
    const actor = {};
    mocks.resolveParticipant.mockImplementation(
      async (reference: { uuid: string }) =>
        reference.uuid === "Actor.left" ? actor : null,
    );
    mocks.canRoll.mockReturnValue(true);
    let click: (() => Promise<void>) | undefined;
    const button = {
      dataset: {} as Record<string, string>,
      disabled: false,
      textContent: "",
      addEventListener: vi.fn((_type: string, listener: () => Promise<void>) => { click = listener; }),
    };
    const leftContainer = { replaceChildren: vi.fn() };
    const card = {
      ownerDocument: { createElement: vi.fn(() => button) },
      querySelector: vi.fn((selector: string) => selector.includes("left") ? leftContainer : null),
    };
    const root = { querySelector: vi.fn(() => card) } as unknown as HTMLElement;
    const message = {
      id: "message",
      getFlag: vi.fn(() => currentState),
    } as unknown as ChatMessage;

    await activateOpposedCheckChatController(message, root, currentState);
    expect(leftContainer.replaceChildren).toHaveBeenCalledExactlyOnceWith(button);
    expect(click).toBeTypeOf("function");
    await click?.();
    expect(mocks.rollSide).toHaveBeenCalledExactlyOnceWith("message", "left");
    expect(button.disabled).toBe(false);
    expect(button.dataset.loading).toBeUndefined();
    expect(button.textContent).toBe("Rolar");
  });

  it("keeps the button disabled and labeled as rolling until the workflow finishes", async () => {
    const currentState = state();
    let finishRoll: (() => void) | undefined;
    mocks.resolveParticipant.mockImplementation(async (reference: { uuid: string }) =>
      reference.uuid === "Actor.left" ? {} : null,
    );
    mocks.canRoll.mockReturnValue(true);
    mocks.rollSide.mockImplementation(
      () => new Promise<"submitted">((resolve) => {
        finishRoll = () => resolve("submitted");
      }),
    );
    let click: (() => Promise<void>) | undefined;
    const button = {
      dataset: {} as Record<string, string>,
      disabled: false,
      textContent: "",
      addEventListener: vi.fn((_type: string, listener: () => Promise<void>) => {
        click = listener;
      }),
    };
    const card = {
      ownerDocument: { createElement: vi.fn(() => button) },
      querySelector: vi.fn((selector: string) =>
        selector.includes("left") ? { replaceChildren: vi.fn() } : null,
      ),
    };
    const message = {
      id: "message",
      getFlag: vi.fn(() => currentState),
    } as unknown as ChatMessage;

    await activateOpposedCheckChatController(
      message,
      { querySelector: vi.fn(() => card) } as unknown as HTMLElement,
      currentState,
    );
    const pending = click?.();
    await vi.waitFor(() => expect(mocks.rollSide).toHaveBeenCalled());

    expect(button.disabled).toBe(true);
    expect(button.dataset.loading).toBe("true");
    expect(button.textContent).toBe("Rolando…");

    finishRoll?.();
    await pending;
    expect(button.disabled).toBe(true);
    expect(button.dataset.loading).toBeUndefined();
    expect(button.textContent).toBe("Rolando…");
  });

  it("restores a pending button after a real workflow error", async () => {
    const currentState = state();
    const error = new Error("submit failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.resolveParticipant.mockImplementation(async (reference: { uuid: string }) =>
      reference.uuid === "Actor.left" ? {} : null,
    );
    mocks.canRoll.mockReturnValue(true);
    mocks.rollSide.mockRejectedValue(error);
    let click: (() => Promise<void>) | undefined;
    const button = {
      dataset: {} as Record<string, string>,
      disabled: false,
      textContent: "",
      addEventListener: vi.fn((_type: string, listener: () => Promise<void>) => {
        click = listener;
      }),
    };
    const card = {
      ownerDocument: { createElement: vi.fn(() => button) },
      querySelector: vi.fn((selector: string) =>
        selector.includes("left") ? { replaceChildren: vi.fn() } : null,
      ),
    };
    const message = {
      id: "message",
      getFlag: vi.fn(() => currentState),
    } as unknown as ChatMessage;

    await activateOpposedCheckChatController(
      message,
      { querySelector: vi.fn(() => card) } as unknown as HTMLElement,
      currentState,
    );
    await click?.();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to roll Opposed Check side"),
      error,
    );
    expect(ui.notifications.error).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
    expect(button.dataset.loading).toBeUndefined();
    expect(button.textContent).toBe("Rolar");
  });

  it("does not project a control when presentation permission is denied", async () => {
    const currentState = state();
    mocks.resolveParticipant.mockResolvedValue({});
    mocks.canRoll.mockReturnValue(false);
    const container = { replaceChildren: vi.fn() };
    const card = {
      ownerDocument: { createElement: vi.fn() },
      querySelector: vi.fn(() => container),
    };
    await activateOpposedCheckChatController(
      {} as ChatMessage,
      { querySelector: () => card } as unknown as HTMLElement,
      currentState,
    );
    expect(container.replaceChildren).not.toHaveBeenCalled();
  });
});
