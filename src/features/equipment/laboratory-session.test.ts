import { afterEach, expect, it, vi } from "vitest";
import { runLaboratorySession, type LaboratoryController } from "./laboratory-session";
import type { LaboratoryView } from "../../application/equipment/laboratory-session";
afterEach(() => vi.unstubAllGlobals());
const initial: LaboratoryView = { sessionId: "opaque", revision: 0, equipmentName: "Nome", formName: "Forma",
  state: "prepared", dice: [], results: [], remaining: 0, ceiling: null };

it("retains command IDs after timeout and passes only terminal outcome to Investigation", async () => {
  let controller!: LaboratoryController;
  const query = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ status: "laboratory", view: {
    ...initial, state: "active", revision: 1, dice: [4, 6, 8, 8], results: [1, 2, 3, 4], remaining: 3, ceiling: 8,
  } }).mockResolvedValueOnce({ status: "laboratory", view: { ...initial, state: "success", revision: 2 },
    terminal: { status: "success", newCount: 2, manual: false } });
  vi.stubGlobal("game", { user: { id: "owner" }, users: { activeGM: { id: "gm", query } } });
  const result = runLaboratorySession(initial, "gm", () => true, undefined, value => {
    controller = value; return { render: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
  });
  await vi.waitFor(() => expect(controller).toBeDefined());
  expect(await controller.command("start")).toEqual({ status: "uncertain" });
  expect(await controller.command("start")).toMatchObject({ status: "laboratory" });
  expect(query.mock.calls[0]).toEqual(query.mock.calls[1]);
  await controller.command("finish");
  expect(await result).toEqual({ status: "success", newCount: 2, manual: false });
});
it("closing the parent queries the current revision and cancels the same session", async () => {
  const abort = new AbortController();
  const close = vi.fn(async () => undefined);
  const query = vi.fn().mockResolvedValueOnce({ status: "laboratory", view: { ...initial, revision: 2, state: "active" } })
    .mockResolvedValueOnce({ status: "laboratory", view: { ...initial, revision: 3, state: "cancelled" }, terminal: { status: "cancelled" } });
  vi.stubGlobal("game", { user: { id: "owner" }, users: { activeGM: { id: "gm", query } } });
  const result = runLaboratorySession(initial, "gm", () => true, abort.signal,
    () => ({ render: vi.fn(async () => undefined), close }));
  abort.abort();
  expect(await result).toEqual({ status: "cancelled" });
  expect(query.mock.calls[1][1]).toMatchObject({ sessionId: "opaque", revision: 2, action: "cancel" });
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
});
it("changed authority returns uncertainty without reconstructing or rolling locally", async () => {
  let controller!: LaboratoryController;
  const query = vi.fn();
  vi.stubGlobal("game", { user: { id: "owner" }, users: { activeGM: { id: "new-gm", query } } });
  const result = runLaboratorySession(initial, "old-gm", () => true, undefined, value => {
    controller = value; return { render: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
  });
  await vi.waitFor(() => expect(controller).toBeDefined());
  expect(await controller.command("start")).toEqual({ status: "uncertain" });
  await controller.cancel();
  expect(await result).toEqual({ status: "uncertain" });
  expect(query).not.toHaveBeenCalled();
});
