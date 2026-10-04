import { afterEach, beforeEach, expect, it, vi } from "vitest";
const select = vi.hoisted(() => vi.fn());
vi.mock("../../applications/equipment/equipment-use-dialog", () => ({ selectEquipmentUse: select }));
import { useEquipment, isEquipmentUseInFlight, subscribeEquipmentUse } from "./use-equipment";
import type { EquipmentUseIntent, EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";
let sequence = 0;
function fixture(count = 2) {
  const forms = [{ id: "first", name: "Primeira", description: "", consumesUse: true },
    { id: "second", name: "Segunda", description: "", consumesUse: false }].slice(0, count);
  const equipment = { type: "equipment", system: { useForms: forms } };
  const actor = { uuid: `Actor.selection${++sequence}`, isOwner: true, getEmbeddedDocument: () => equipment } as unknown as foundry.documents.Actor;
  const gm = { id: "gm" };
  const game = { user: { id: "owner", isGM: false }, users: { activeGM: gm as { id: string } | null } };
  vi.stubGlobal("game", game);
  const dispatch = vi.fn(async (_intent: EquipmentUseIntent): Promise<EquipmentUseResult> =>
    ({ status: "success", newCount: 0, manual: false }));
  return { actor, equipment, dispatch, game };
}
beforeEach(() => select.mockReset().mockResolvedValue("second"));
afterEach(() => vi.unstubAllGlobals());
it("selects every form independently of POI configuration and cancellation has no effects", async () => {
  const f = fixture();
  select.mockResolvedValueOnce(null);
  expect(await useEquipment(f.actor, "e", f.dispatch)).toEqual({ status: "cancelled" });
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(await useEquipment(f.actor, "e", f.dispatch)).toMatchObject({ status: "success" });
  expect(select).toHaveBeenCalledWith(f.equipment, f.equipment.system.useForms);
  expect(f.dispatch.mock.calls[0][0]).toMatchObject({ useFormId: "second" });
});
it.each([0, 1])("runs %i forms without opening a picker", async count => {
  const f = fixture(count);
  await useEquipment(f.actor, "e", f.dispatch);
  expect(select).not.toHaveBeenCalled();
  expect(f.dispatch.mock.calls[0][0].useFormId).toBe(count ? "first" : null);
});
it("blocks double clicks across consumers during selection and releases listeners afterwards", async () => {
  const f = fixture();
  let finish!: (id: string) => void;
  select.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  const listener = vi.fn();
  const stop = subscribeEquipmentUse(listener);
  const first = useEquipment(f.actor, "e", f.dispatch, "poi");
  expect(isEquipmentUseInFlight(f.actor.uuid, "e")).toBe(true);
  expect(await useEquipment(f.actor, "e", f.dispatch)).toEqual({ status: "busy" });
  finish("second");
  await first;
  stop();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(isEquipmentUseInFlight(f.actor.uuid, "e")).toBe(false);
  expect(f.dispatch).toHaveBeenCalledOnce();
});
it("retries a timeout with the same operation ID and no local fallback; changing context or authority requires review", async () => {
  const f = fixture(1);
  f.dispatch.mockRejectedValueOnce(new Error("query timeout"));
  expect(await useEquipment(f.actor, "e", f.dispatch, "poi")).toEqual({ status: "uncertain" });
  expect(await useEquipment(f.actor, "e", f.dispatch, "other")).toEqual({ status: "uncertain" });
  f.game.users.activeGM = { id: "otherGM" };
  expect(await useEquipment(f.actor, "e", f.dispatch, "poi")).toEqual({ status: "uncertain" });
  f.game.users.activeGM = { id: "gm" };
  await useEquipment(f.actor, "e", f.dispatch, "poi");
  expect(f.dispatch.mock.calls[0][0]).toEqual(f.dispatch.mock.calls[1][0]);
});
