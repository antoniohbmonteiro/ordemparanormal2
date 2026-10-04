import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const publish = vi.hoisted(() => vi.fn());
vi.mock("../chat/publish-equipment-message", () => ({ publishEquipmentMessage: publish }));
import { executeEquipmentUse, registerEquipmentUseQuery, EQUIPMENT_USE_QUERY, type EquipmentUseIntent } from "./execute-equipment-use";
import { adjustOwnedEquipmentUses, registerEquipmentUsesAdjustmentQuery } from "./adjust-owned-equipment-uses";
import { mutateOwnedEquipmentUses, registerEquipmentUsesMutationQuery } from "./mutate-owned-equipment-uses";

let sequence = 0;
function fixture(value = 2) {
  const requester = { id: "owner", isGM: false };
  const other = { id: "second", isGM: false };
  const gm = { id: "gm", isGM: true };
  const equipment = { id: "e", type: "equipment", uuid: "Actor.a.Item.e", isEmbedded: true,
    _stats: { duplicateSource: "Item.source" }, actor: null as unknown, system: {
      category: "tool", quantity: 3, uses: { value, max: 3 },
      useForms: [{ id: "scan", name: "Examinar", description: "", consumesUse: true },
        { id: "free", name: "Observar", description: "", consumesUse: false }] },
    update: vi.fn(async (patch: Record<string, unknown>) => {
      if ("system.uses.value" in patch) equipment.system.uses.value = patch["system.uses.value"] as number;
      if ("system.uses.max" in patch) equipment.system.uses.max = patch["system.uses.max"] as number;
      if ("system.uses" in patch) equipment.system.uses = patch["system.uses"] as typeof equipment.system.uses;
    }) };
  const actor = { uuid: "Actor.a", type: "agent", isOwner: true,
    testUserPermission: vi.fn(() => true), getEmbeddedDocument: vi.fn(() => equipment),
    update: vi.fn(), system: { resources: { determination: { value: 5 } } } };
  equipment.actor = actor;
  const users = [gm, requester, other];
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, get: (id: string) => users.find(u => u.id === id) },
    actors: { get: (id: string) => id === "a" ? actor : null } });
  const intent: EquipmentUseIntent = { actorUuid: actor.uuid, equipmentId: "e", useFormId: "scan", operationId: `operation-${++sequence}` };
  return { actor, equipment, requester: requester as foundry.documents.User, other: other as foundry.documents.User, intent };
}
beforeEach(() => publish.mockReset().mockResolvedValue(undefined));
afterEach(() => vi.unstubAllGlobals());

describe("authoritative equipment execution", () => {
  it("consumes once, publishes the selected form and leaves quantity, PD and Actor untouched", async () => {
    const f = fixture();
    const post = vi.fn(async (_resolved: unknown) => ({ newCount: 2, manual: false }));
    expect(await executeEquipmentUse(f.intent, f.requester, "context", post)).toEqual({ status: "success", newCount: 2, manual: false });
    expect(f.equipment.update).toHaveBeenCalledExactlyOnceWith({ "system.uses.value": 1 });
    expect(publish.mock.calls[0][2]).toEqual(f.equipment.system.useForms[0]);
    expect(post.mock.calls[0][0]).toMatchObject({ sourceUuid: "Item.source", isTool: true });
    expect(f.equipment.system.quantity).toBe(3);
    expect(f.actor.update).not.toHaveBeenCalled();
    expect(f.actor.system.resources.determination.value).toBe(5);
  });
  it("serializes two owners racing for the last use", async () => {
    const f = fixture(1);
    const results = await Promise.all([executeEquipmentUse(f.intent, f.requester),
      executeEquipmentUse({ ...f.intent, operationId: `second-${sequence}` }, f.other)]);
    expect(results.map(r => r.status)).toEqual(["success", "insufficient"]);
    expect(f.equipment.update).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
  });
  it("deduplicates concurrent same-operation requests and rejects replay under another context", async () => {
    const f = fixture();
    const results = await Promise.all([executeEquipmentUse(f.intent, f.requester, "poi-a"),
      executeEquipmentUse(f.intent, f.requester, "poi-a")]);
    expect(results[0]).toEqual(results[1]);
    expect(f.equipment.update).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
    expect(await executeEquipmentUse(f.intent, f.requester, "poi-b")).toEqual({ status: "invalid" });
  });
  it("serializes manual adjustment with usage instead of overwriting its payment", async () => {
    const f = fixture(2);
    await Promise.all([executeEquipmentUse(f.intent, f.requester),
      adjustOwnedEquipmentUses(f.actor as unknown as foundry.documents.Actor, "e", -1)]);
    expect(f.equipment.system.uses.value).toBe(0);
    expect(f.equipment.update.mock.calls.map(([patch]) => patch["system.uses.value"])).toEqual([1, 0]);
  });
  it("serializes ItemSheet counter edits/removal with consumption and never writes a stale value with max", async () => {
    const f = fixture();
    await Promise.all([executeEquipmentUse(f.intent, f.requester), mutateOwnedEquipmentUses(
      f.actor as unknown as foundry.documents.Actor, "e", { kind: "set", field: "max", value: 4 })]);
    expect(f.equipment.system.uses).toEqual({ value: 1, max: 4 });
    expect(f.equipment.update.mock.calls[1][0]).toEqual({ "system.uses.max": 4 });
    await mutateOwnedEquipmentUses(f.actor as unknown as foundry.documents.Actor, "e", { kind: "remove" });
    expect((await executeEquipmentUse({ ...f.intent, operationId: "after-remove-" + sequence }, f.requester)).status).toBe("invalid");
    await mutateOwnedEquipmentUses(f.actor as unknown as foundry.documents.Actor, "e", { kind: "add" });
    expect(f.equipment.system.uses).toEqual({ value: 0, max: 0 });
  });
  it("retries publication after payment without consuming again", async () => {
    const f = fixture();
    publish.mockRejectedValueOnce(new Error("chat transport"));
    expect(await executeEquipmentUse(f.intent, f.requester)).toEqual({ status: "partial", stage: "publication" });
    expect(await executeEquipmentUse(f.intent, f.requester)).toEqual({ status: "success", newCount: 0, manual: false });
    expect(f.equipment.update).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledTimes(2);
  });
  it("retries post-use discovery without consuming or publishing again", async () => {
    const f = fixture();
    const post = vi.fn().mockRejectedValueOnce(new Error("POI write")).mockResolvedValue({ newCount: 1, manual: false });
    expect(await executeEquipmentUse(f.intent, f.requester, "poi", post)).toEqual({ status: "partial", stage: "discovery" });
    expect(await executeEquipmentUse(f.intent, f.requester, "poi", post)).toEqual({ status: "success", newCount: 1, manual: false });
    expect(f.equipment.update).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
  });
  it("holds ambiguous payment failures for manual review", async () => {
    const f = fixture();
    f.equipment.update.mockRejectedValueOnce(new Error("timeout after commit"));
    expect(await executeEquipmentUse(f.intent, f.requester)).toEqual({ status: "uncertain" });
    expect(await executeEquipmentUse(f.intent, f.requester)).toEqual({ status: "uncertain" });
    expect(f.equipment.update).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });
  it("revalidates changed forms, resources, ownership and Actor/Item relationship", async () => {
    const f = fixture();
    f.equipment.system.useForms = f.equipment.system.useForms.slice(1);
    expect(await executeEquipmentUse(f.intent, f.requester)).toEqual({ status: "invalid" });
    f.intent = { ...f.intent, useFormId: "free" };
    f.actor.testUserPermission.mockReturnValue(false);
    expect(await executeEquipmentUse(f.intent, f.requester)).toEqual({ status: "forbidden" });
    f.actor.testUserPermission.mockReturnValue(true);
    f.equipment.actor = {};
    expect(await executeEquipmentUse(f.intent, f.requester)).toEqual({ status: "forbidden" });
    expect(f.equipment.update).not.toHaveBeenCalled();
  });
  it("permits zero-resource free forms and no-form legacy cards", async () => {
    const f = fixture(0);
    expect((await executeEquipmentUse({ ...f.intent, useFormId: "free" }, f.requester)).status).toBe("success");
    f.equipment.system.useForms = [];
    expect((await executeEquipmentUse({ ...f.intent, operationId: "legacy-" + sequence, useFormId: null }, f.requester)).status).toBe("success");
    expect(publish.mock.calls[1][2]).toBeNull();
    expect(f.equipment.update).not.toHaveBeenCalled();
  });
  it("authenticates query requesters and rejects missing/malformed requests and manual adjustment", async () => {
    const f = fixture();
    const queries: Record<string, (input: unknown, context: unknown) => Promise<unknown>> = {};
    vi.stubGlobal("CONFIG", { queries });
    registerEquipmentUseQuery();
    registerEquipmentUsesAdjustmentQuery();
    registerEquipmentUsesMutationQuery();
    expect(await queries[EQUIPMENT_USE_QUERY](f.intent, { user: { id: "owner", isGM: true } })).toEqual({ status: "forbidden" });
    expect(await queries[EQUIPMENT_USE_QUERY](null, { user: f.requester })).toEqual({ status: "invalid" });
    f.actor.testUserPermission.mockReturnValue(false);
    expect(await queries["ordemparanormal2.adjustEquipmentUses"]({ actorUuid: "Actor.a", equipmentId: "e", adjustment: -1 },
      { user: f.requester })).toEqual({ status: "invalid" });
    expect(f.equipment.update).not.toHaveBeenCalled();
    expect(await queries["ordemparanormal2.changeEquipmentUses"](
      { actorUuid: "Actor.a", equipmentId: "e", mutation: { kind: "set", field: "max", value: 10 } },
      { user: f.requester })).toBe(false);
    expect(await queries["ordemparanormal2.changeEquipmentUses"](
      { actorUuid: "Actor.a", equipmentId: "e", mutation: { kind: "set", field: "quantity", value: 10 } },
      { user: f.requester })).toBe(false);
  });
});
