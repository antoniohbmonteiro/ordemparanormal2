import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runRadioSession, type RadioController } from "./radio-session";
import type { RadioView } from "../../application/equipment/radio-session";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), mode: vi.fn() }));
vi.mock("../checks/resolve-agent-check-interaction", () => ({ prepareAgentCheckInteraction: mocks.prepare }));
vi.mock("../../adapters/foundry/chat/publish-check-message", () => ({ getCurrentMessageMode: mocks.mode, isRegisteredMessageMode: () => true }));
beforeEach(() => {
  mocks.prepare.mockReset().mockResolvedValue({ selectedAttribute: "mind", stepAdjustments: { mind: 0, technology: 0 }, extraDice: [], abilityUses: [] });
  mocks.mode.mockReset().mockReturnValue("blind");
});
afterEach(() => vi.unstubAllGlobals());
const initial: RadioView = { sessionId: "opaque", revision: 0, equipmentName: "Nome", formName: "Forma", state: "prepared",
  removedCount: 0, active: [], discarded: [] };
const actor = {} as foundry.documents.Actor;
const window = { render: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
it("keeps the same Check choices, mode and command ID after timeout and returns only the terminal result", async () => {
  let controller!: RadioController;
  const query = vi.fn().mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce({ status: "radio", view: { ...initial, state: "active", revision: 1, removedCount: 2 } })
    .mockResolvedValueOnce({ status: "radio", view: { ...initial, state: "success", revision: 2 }, terminal: { status: "success", newCount: 2, manual: false } });
  vi.stubGlobal("game", { user: { id: "owner" }, users: { activeGM: { id: "gm", query } } });
  const result = runRadioSession(actor, initial, "gm", () => true, undefined, value => { controller = value; return window; });
  await vi.waitFor(() => expect(controller).toBeDefined());
  expect(await controller.command("start")).toEqual({ status: "uncertain" });
  await controller.command("start");
  expect(mocks.prepare).toHaveBeenCalledOnce(); expect(query.mock.calls[0]).toEqual(query.mock.calls[1]);
  expect(query.mock.calls[0][1]).toMatchObject({ messageMode: "blind", action: "start" });
  await controller.command("finish");
  expect(await result).toEqual({ status: "success", newCount: 2, manual: false });
});
it("cancelled Check selection sends no start and produces no success feedback", async () => {
  mocks.prepare.mockResolvedValue(null);
  let controller!: RadioController;
  const query = vi.fn().mockResolvedValueOnce({ status: "radio", view: initial })
    .mockResolvedValueOnce({ status: "radio", view: { ...initial, state: "cancelled" }, terminal: { status: "cancelled" } });
  vi.stubGlobal("game", { user: { id: "owner" }, users: { activeGM: { id: "gm", query } } });
  const result = runRadioSession(actor, initial, "gm", () => true, undefined, value => { controller = value; return window; });
  await vi.waitFor(() => expect(controller).toBeDefined()); await controller.command("start");
  expect(query.mock.calls.map(call => call[1].action)).toEqual(["get", "cancel"]);
  expect(await result).toEqual({ status: "cancelled" });
});
it("parent abort closes a pending Check and cancels at the current revision", async () => {
  const abort = new AbortController(); let controller!: RadioController;
  mocks.prepare.mockImplementation((_actor, _selection, options) => new Promise(resolve => options.signal.addEventListener("abort", () => resolve(null), { once: true })));
  const query = vi.fn(async (_name, input) => input.action === "get"
    ? { status: "radio", view: { ...initial, revision: 2 } }
    : { status: "radio", view: { ...initial, state: "cancelled", revision: 3 }, terminal: { status: "cancelled" } });
  vi.stubGlobal("game", { user: { id: "owner" }, users: { activeGM: { id: "gm", query } } });
  const result = runRadioSession(actor, initial, "gm", () => true, abort.signal, value => { controller = value; return window; });
  await vi.waitFor(() => expect(controller).toBeDefined()); const start = controller.command("start");
  await vi.waitFor(() => expect(mocks.prepare).toHaveBeenCalledOnce()); abort.abort(); await start;
  expect(await result).toEqual({ status: "cancelled" });
  expect(query.mock.calls.some(call => call[1].action === "start")).toBe(false);
  expect(query.mock.calls.find(call => call[1].action === "cancel")![1].revision).toBe(2);
  expect(query.mock.calls.filter(call => call[1].action === "cancel")).toHaveLength(1);
});
it("restores a pending start from the GM without asking for another Check", async () => {
  let controller!: RadioController;
  const pending = { sessionId: "opaque", commandId: "original", revision: 0, action: "start" as const,
    choices: { stepAdjustments: { mind: 0, technology: 0 }, extraDice: [], abilityUses: [] }, messageMode: "blind" };
  const query = vi.fn().mockResolvedValueOnce({ status: "radio", view: { ...initial, state: "active", revision: 1 } })
    .mockResolvedValueOnce({ status: "radio", view: { ...initial, state: "active", revision: 1 } })
    .mockResolvedValueOnce({ status: "radio", view: { ...initial, state: "cancelled" }, terminal: { status: "cancelled" } });
  vi.stubGlobal("game", { user: { id: "owner" }, users: { activeGM: { id: "gm", query } } });
  const result = runRadioSession(actor, { ...initial, pendingCommand: pending }, "gm", () => true, undefined, value => { controller = value; return window; });
  await vi.waitFor(() => expect(controller).toBeDefined()); await controller.command("start"); await controller.cancel(); await result;
  expect(query.mock.calls[0][1]).toEqual(pending); expect(mocks.prepare).not.toHaveBeenCalled();
});
it("changed authority never submits a Check or substitutes a local execution", async () => {
  let controller!: RadioController; const query = vi.fn();
  vi.stubGlobal("game", { user: { id: "owner" }, users: { activeGM: { id: "new-gm", query } } });
  const result = runRadioSession(actor, { ...initial, state: "active" }, "old-gm", () => true, undefined, value => { controller = value; return window; });
  await vi.waitFor(() => expect(controller).toBeDefined()); expect(await controller.command("finish")).toEqual({ status: "uncertain" });
  await controller.cancel(); expect(await result).toEqual({ status: "uncertain" }); expect(query).not.toHaveBeenCalled();
});
