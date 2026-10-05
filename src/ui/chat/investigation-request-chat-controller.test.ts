import { afterEach, expect, it, vi } from "vitest";

const { decide, grant } = vi.hoisted(() => ({ decide: vi.fn(), grant: vi.fn() }));
vi.mock("../../adapters/foundry/points-of-interest/investigation-requests", () => ({
  dispatchInvestigationDecision: decide,
}));
vi.mock("../../applications/points-of-interest/investigation-clue-dialog", () => ({ openPendingShareClueGrant: grant }));
const { activateInvestigationRequestChatController, activateInvestigationShareGrantController } =
  await import("./investigation-request-chat-controller");
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function card(isGM: boolean) {
  const buttons: Array<{ textContent: string; disabled: boolean; className: string; click: () => void }> = [];
  const container = { append: (button: typeof buttons[number]) => { buttons.push(button); },
    querySelectorAll: () => buttons };
  const root = { ownerDocument: { createElement: () => {
    const listeners: Array<() => void> = [];
    return { type: "", textContent: "", className: "", disabled: false,
      addEventListener: (_event: string, listener: () => void) => { listeners.push(listener); },
      click: () => listeners.forEach(listener => listener()) };
  } }, querySelector: () => container };
  vi.stubGlobal("game", { user: { isGM }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("ui", { notifications: { error: vi.fn() } });
  return { root: root as unknown as HTMLElement, buttons };
}

it("shows Reject then Approve only to a GM and dispatches the chosen decision", async () => {
  const state = { kind: "recap", status: "pending" } as never;
  const message = { id: "request" } as ChatMessage;
  const player = card(false);
  activateInvestigationRequestChatController(message, player.root, state);
  expect(player.buttons).toHaveLength(0);
  const gm = card(true);
  activateInvestigationRequestChatController(message, gm.root, state);
  expect(gm.buttons.map(button => button.textContent)).toEqual([
    "ORDEMPARANORMAL2.PointOfInterest.InvestigationControl.Decline",
    "ORDEMPARANORMAL2.PointOfInterest.InvestigationControl.Approve",
  ]);
  decide.mockResolvedValue(true);
  gm.buttons[0].click();
  await Promise.resolve();
  expect(decide).toHaveBeenCalledExactlyOnceWith("request", false);
  expect(gm.buttons.every(button => button.disabled)).toBe(true);
});

it("lets only the active GM invoke the shared Share clue grant from its card", async () => {
  const gm = { id: "gm", isGM: true };
  const player = { id: "player", isGM: false };
  const listeners: Array<() => void> = [];
  const button = { disabled: false, addEventListener: (_event: string, listener: () => void) => listeners.push(listener) };
  const root = { querySelector: () => button } as unknown as HTMLElement;
  const state = { kind: "share", sceneId: "scene", runId: "run" } as never;
  vi.stubGlobal("game", { user: player, users: { activeGM: gm }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("ui", { notifications: { error: vi.fn() } });
  activateInvestigationShareGrantController(root, state);
  expect(listeners).toHaveLength(0);
  (game as typeof game & { user: typeof gm }).user = gm as never;
  activateInvestigationShareGrantController(root, state);
  expect(listeners).toHaveLength(1);
  grant.mockResolvedValue(true);
  listeners[0]();
  await Promise.resolve();
  expect(grant).toHaveBeenCalledExactlyOnceWith("scene", "run");
});
