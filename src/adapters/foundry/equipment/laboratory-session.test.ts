import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LaboratoryResponse, LaboratoryView } from "../../../application/equipment/laboratory-session";
import type { PoiToolIntent } from "../points-of-interest/use-poi-tool";
import { readPoiKnowledge } from "../points-of-interest/poi-runtime-state";
import { readPoiDiscoveries } from "../points-of-interest/poi-discovery";
import { syntheticToolPresets } from "../../../qa/playtest-alpha-tools-fixture";
import { ACT_TWO_TOOL_SOURCES } from "../../../config/adventure-poi-sources/playtest-alpha-act-two-tools";
const mocks = vi.hoisted(() => ({ roll: vi.fn(), equipment: vi.fn(), result: vi.fn() }));
vi.mock("../dice/execute-laboratory-roll", () => ({ executeLaboratoryRoll: mocks.roll }));
vi.mock("../chat/publish-equipment-message", () => ({ publishEquipmentMessage: mocks.equipment }));
vi.mock("../chat/publish-laboratory-result", () => ({ publishLaboratoryResult: mocks.result }));
let adapter: typeof import("./laboratory-session");
let executor: typeof import("./execute-equipment-use");
let serial = 0;
function fixture(run = true, consumesUse = true) {
  const gm = { id: "gm", isGM: true, active: false };
  const owner = { id: "owner", isGM: false, active: false };
  const other = { id: "other", isGM: false, active: false };
  const users = [gm, owner, other];
  const flags: Record<string, unknown> = { pointOfInterestVisibility: { mode: "everyone", users: [], notified: [] } };
  const sceneFlags: Record<string, unknown> = { pointOfInterestItems: ["Item.poi"], ...(run ? {
    investigationRuntime: { schemaVersion: 1, runId: "run", round: 1, actedAgentUuids: [] } } : {}) };
  const approach = { type: "tool", equipmentUuid: "Item.source", useFormId: "analyze",
    mechanicConfig: { type: "laboratory", sequenceLength: 4 } };
  const equipment = { id: "e", name: "Equipamento sem nome especial", type: "equipment", uuid: "Actor.a.Item.e", isEmbedded: true,
    _stats: { duplicateSource: "Item.source" }, actor: null as unknown,
    system: { category: "tool", quantity: 3, uses: { value: 2, max: 3 }, useForms: [
      { id: "analyze", name: "Forma", description: "", consumesUse, mechanic: "laboratory" }] },
    update: vi.fn(async (patch: Record<string, number>) => { equipment.system.uses.value = patch["system.uses.value"]; }) };
  let exists = true;
  const actors = ["a", "b"].map(id => ({ uuid: `Actor.${id}`, type: "agent", name: id, isOwner: true,
    getEmbeddedDocument: () => exists && id === "a" ? equipment : null,
    testUserPermission: vi.fn(() => true), update: vi.fn(),
    system: { attributes: { mind: 6 }, skills: { aptitude: { exactSciences: 8 } }, resources: { determination: { value: 5 } } } }));
  equipment.actor = actors[0];
  const item = { uuid: "Item.poi", type: "pointOfInterest", name: "Local", isEmbedded: false, pack: null,
    ownership: { default: 0 }, testUserPermission: () => false, getFlag: (_scope: string, key: string) => flags[key],
    system: { information: [
      { id: "one", content: "Pista privada A", approaches: [structuredClone(approach)] },
      { id: "two", content: "Pista privada B", approaches: [structuredClone(approach)] },
      { id: "situational", content: "Pista privada C", approaches: [structuredClone(approach)],
        availability: { mode: "situational", condition: "Condição privada" } },
    ] }, update: vi.fn(async (patch: Record<string, unknown>) => {
      for (const [path, value] of Object.entries(patch)) flags[path.split(".").at(-1)!] = value;
    }) };
  const scene = { id: "s", tokens: [{ actorId: "a", actorLink: true }, { actorId: "b", actorLink: true }],
    getFlag: (_scope: string, key: string) => sceneFlags[key] };
  const runtime = { user: gm, users: { activeGM: gm, contents: users, get: (id: string) => users.find(user => user.id === id) },
    actors: { get: (id: string) => actors.find(actor => actor.uuid === `Actor.${id}`) },
    items: { get: (id: string) => id === "poi" ? item : null }, scenes: { get: (id: string) => id === "s" ? scene : null } };
  vi.stubGlobal("game", runtime);
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 } });
  vi.stubGlobal("CONFIG", { queries: {} });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  const intent: PoiToolIntent = { actorUuid: "Actor.a", equipmentId: "e", useFormId: "analyze", operationId: `lab-${++serial}`,
    context: { sceneId: "s", itemUuid: "Item.poi", runId: run ? "run" : null } };
  const requester = owner as foundry.documents.User;
  let counter = 0;
  const command = (view: LaboratoryView, action: "start" | "reroll" | "finish" | "cancel" | "get", positions?: readonly number[]) => ({
    sessionId: view.sessionId, revision: view.revision, commandId: `command-${++counter}`, action,
    ...(positions ? { positions } : {}) });
  return { flags, sceneFlags, equipment, actors, item: item as unknown as foundry.documents.Item, rawItem: item, runtime,
    scene, requester, other: other as foundry.documents.User, intent, command, remove: () => { exists = false; } };
}
function asView(result: LaboratoryResponse | { status: "unconfigured" }): LaboratoryView {
  expect(result.status).toBe("laboratory");
  if (result.status !== "laboratory") throw new Error(JSON.stringify(result));
  return result.view;
}
function rolls(values: number[]) {
  mocks.roll.mockReset();
  for (const value of values) mocks.roll.mockResolvedValueOnce({ value, serialized: { formula: "1d4", total: value } });
}
beforeEach(async () => {
  vi.resetModules();
  mocks.equipment.mockReset().mockResolvedValue(undefined);
  mocks.result.mockReset().mockResolvedValue(undefined);
  rolls([1, 2, 3, 4]);
  adapter = await import("./laboratory-session");
  executor = await import("./execute-equipment-use");
});
afterEach(() => vi.unstubAllGlobals());

describe("authoritative laboratory sessions", () => {
  it("finishes with nonmanual zero when its only automatic answer is already known", async () => {
    const f = fixture(true, false);
    f.rawItem.system.information = f.rawItem.system.information.slice(0, 1);
    f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.a", informationIds: ["one"] }] };
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    const finish = f.command(started, "finish");
    const expected = { terminal: { status: "success", newCount: 0, manual: false } };
    expect(await adapter.resolveLaboratoryCommand(finish, f.requester)).toMatchObject(expected);
    expect(await adapter.resolveLaboratoryCommand(finish, f.requester)).toMatchObject(expected);
    expect(f.rawItem.update).not.toHaveBeenCalled();
    expect(mocks.roll).toHaveBeenCalledTimes(4);
    expect(mocks.result).toHaveBeenCalledOnce();
  });
  it("retains zero with pending manual resolution after a partial conclusion publication", async () => {
    const f = fixture(true, false);
    f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.a", informationIds: ["one", "two"] }] };
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    const finish = f.command(started, "finish");
    mocks.result.mockRejectedValueOnce(new Error("Lost conclusion"));
    expect(await adapter.resolveLaboratoryCommand(finish, f.requester)).toEqual({ status: "partial", stage: "publication" });
    expect(await adapter.resolveLaboratoryCommand(finish, f.requester))
      .toMatchObject({ terminal: { status: "success", newCount: 0, manual: true } });
    expect(f.rawItem.update).not.toHaveBeenCalled();
    expect(mocks.roll).toHaveBeenCalledTimes(4);
  });
  it("uses the imported knife interaction and leaves the three-player blood response manual", async () => {
    const f = fixture(true, false);
    const preset = syntheticToolPresets().find(preset => preset.id === "actTwo.map.06")!;
    Object.assign(f.rawItem.system, { information: structuredClone(preset.information) });
    Object.assign(f.equipment._stats, { compendiumSource: ACT_TWO_TOOL_SOURCES.laboratory.equipmentUuid });
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    expect(await adapter.resolveLaboratoryCommand(f.command(started, "finish"), f.requester))
      .toMatchObject({ terminal: { status: "success", newCount: 1 } });
    expect(readPoiKnowledge(f.item)).toEqual([{ actorUuid: "Actor.a", informationIds: ["actTwo.map.06.tool.laboratory"] }]);
    expect(readPoiDiscoveries(f.item)).toHaveLength(1);
    expect(f.equipment.update).not.toHaveBeenCalled();
  });
  it("keeps a situational-only imported Laboratory configured and does not fall back after removing its binding", async () => {
    const f = fixture(true, false);
    Object.assign(f.rawItem.system, { information: structuredClone(syntheticToolPresets().find(preset => preset.id === "actTwo.map.07")!.information) });
    Object.assign(f.equipment._stats, { compendiumSource: ACT_TWO_TOOL_SOURCES.laboratory.equipmentUuid });
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    f.rawItem.system.information = [];
    expect(await adapter.prepareLaboratory(f.intent, f.requester)).toMatchObject({ status: "laboratory", view: prepared });
    expect(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester))
      .toMatchObject({ terminal: { status: "invalid" } });
    expect(mocks.equipment).not.toHaveBeenCalled();
  });
  it("serializes concurrent preparation/start of the last use without another payment or sequence", async () => {
    const f = fixture(); adapter.registerLaboratoryQueries();
    f.equipment.system.uses.value = 1;
    const preparations = await Promise.all([adapter.prepareLaboratory(f.intent, f.requester),
      adapter.prepareLaboratory({ ...f.intent, operationId: "second-owner" }, f.other)]);
    expect(preparations[1]).toEqual({ status: "busy" });
    const start = f.command(asView(preparations[0]), "start");
    const starts = await Promise.all([adapter.resolveLaboratoryCommand(start, f.requester), adapter.resolveLaboratoryCommand(start, f.requester)]);
    expect(starts[0]).toEqual(starts[1]);
    expect(f.equipment.system.uses.value).toBe(0);
    expect(f.equipment.update).toHaveBeenCalledOnce();
    expect(mocks.roll).toHaveBeenCalledTimes(4);
  });
  it.each(["cancel-first", "finish-first"])("orders cancellation and finalization: %s", async order => {
    const f = fixture();
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    const cancel = f.command(started, "cancel"), finish = f.command(started, "finish");
    const commands = order === "cancel-first" ? [cancel, finish] : [finish, cancel];
    const results = await Promise.all(commands.map(command => adapter.resolveLaboratoryCommand(command, f.requester)));
    expect(results[0]).toMatchObject({ terminal: { status: order === "cancel-first" ? "cancelled" : "success" } });
    expect(readPoiKnowledge(f.item)).toHaveLength(order === "cancel-first" ? 0 : 1);
    expect(mocks.result).toHaveBeenCalledOnce();
  });
  it.each([false, true])("cancel after an ambiguous Knowledge write respects whether it committed: %s", async committed => {
    const f = fixture();
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    const write = f.rawItem.update.getMockImplementation()!;
    f.rawItem.update.mockImplementationOnce(async patch => { if (committed) await write(patch); throw new Error("write rejected"); });
    expect(await adapter.resolveLaboratoryCommand(f.command(started, "finish"), f.requester)).toEqual({ status: "partial", stage: "discovery" });
    const recovered = asView(await adapter.resolveLaboratoryCommand(f.command(started, "get"), f.requester));
    expect(await adapter.resolveLaboratoryCommand(f.command(recovered, "cancel"), f.requester)).toMatchObject({
      terminal: { status: committed ? "success" : "cancelled" } });
    expect(readPoiKnowledge(f.item)).toHaveLength(committed ? 1 : 0);
    expect(f.rawItem.update).toHaveBeenCalledOnce();
  });
  it("another operation cannot publish an unfinished successful discovery as a zero-count terminal result", async () => {
    const f = fixture();
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    f.rawItem.update.mockRejectedValueOnce(new Error("write failed before commit"));
    const finish = f.command(started, "finish");
    expect(await adapter.resolveLaboratoryCommand(finish, f.requester)).toEqual({ status: "partial", stage: "discovery" });
    expect(await adapter.prepareLaboratory({ ...f.intent, operationId: "other-owner" }, f.other)).toEqual({ status: "busy" });
    expect(mocks.result).not.toHaveBeenCalled();
    expect(await adapter.resolveLaboratoryCommand(finish, f.requester)).toMatchObject({ terminal: { newCount: 2 } });
    expect(mocks.result.mock.calls[0][2]).toMatchObject({ newCount: 2, outcome: "success" });
  });
  it("prepares without effects and never sends the GM's bindings or unknown contents", async () => {
    const f = fixture();
    const prepared = await adapter.prepareLaboratory(f.intent, f.requester);
    expect(asView(prepared)).toMatchObject({ state: "prepared", results: [], dice: [] });
    expect(f.equipment.update).not.toHaveBeenCalled();
    expect(mocks.equipment).not.toHaveBeenCalled();
    expect(mocks.roll).not.toHaveBeenCalled();
    expect(JSON.stringify(prepared)).not.toMatch(/Item.source|informationIds|Pista privada|Condição privada|mechanicConfig|sequenceLength/);
    expect(await adapter.prepareLaboratory(f.intent, f.requester)).toEqual(prepared);
    expect(await adapter.prepareLaboratory({ ...f.intent, context: { ...f.intent.context, itemUuid: "Item.other" } }, f.requester))
      .toEqual({ status: "invalid" });
  });
  it("starts once, freezes attributes, charges selected positions and deduplicates every command", async () => {
    const f = fixture(); adapter.registerLaboratoryQueries();
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const start = f.command(prepared, "start");
    const initial = asView(await adapter.resolveLaboratoryCommand(start, f.requester));
    expect(initial).toMatchObject({ state: "active", results: [1, 2, 3, 4], dice: [4, 6, 8, 8], remaining: 3 });
    expect(await adapter.resolveLaboratoryCommand(start, f.requester)).toMatchObject({ view: initial });
    expect(f.equipment.system.uses.value).toBe(1);
    expect(mocks.equipment).toHaveBeenCalledOnce();
    f.actors[0].system.attributes.mind = 20; f.actors[0].system.skills.aptitude.exactSciences = 12;
    rolls([1, 2]);
    const reroll = f.command(initial, "reroll", [0, 3]);
    const updated = asView(await adapter.resolveLaboratoryCommand(reroll, f.requester));
    expect(updated).toMatchObject({ results: [1, 2, 3, 2], remaining: 1, dice: initial.dice });
    expect(await adapter.resolveLaboratoryCommand(reroll, f.requester)).toMatchObject({ view: updated });
    expect(mocks.roll).toHaveBeenCalledTimes(2);
    expect(await adapter.resolveLaboratoryCommand({ ...reroll, positions: [1] }, f.requester)).toEqual({ status: "invalid" });
    expect(await adapter.resolveLaboratoryCommand(f.command(initial, "finish"), f.requester)).toEqual({ status: "invalid" });
    const failed = await adapter.resolveLaboratoryCommand(f.command(updated, "finish"), f.requester);
    expect(failed).toMatchObject({ view: { state: "failure" }, terminal: { status: "success", newCount: 0 } });
    expect(readPoiKnowledge(f.item)).toEqual([]);
    expect(mocks.result.mock.calls[0][2]).toMatchObject({ schemaVersion: 1, mind: 6, ceiling: 8, remaining: 1, outcome: "failure" });
    expect(f.equipment.update).toHaveBeenCalledOnce();
    expect(f.actors[0].update).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])("grants %i new clues using the existing isolated Knowledge/Discovery", async knownCount => {
    const f = fixture();
    f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.a", informationIds: ["one", "two"].slice(0, 2 - knownCount) },
      { actorUuid: "Actor.b", informationIds: ["situational"] }] };
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    const finish = f.command(started, "finish");
    expect(await adapter.resolveLaboratoryCommand(finish, f.requester)).toMatchObject({ terminal: { status: "success", newCount: knownCount } });
    expect(await adapter.resolveLaboratoryCommand(finish, f.requester)).toMatchObject({ terminal: { newCount: knownCount } });
    expect(readPoiKnowledge(f.item)).toEqual([{ actorUuid: "Actor.a", informationIds: ["one", "two"] },
      { actorUuid: "Actor.b", informationIds: ["situational"] }]);
    expect(readPoiDiscoveries(f.item)).toHaveLength(knownCount);
    expect(f.actors[0].system.resources.determination.value).toBe(5);
    expect(f.sceneFlags.investigationRuntime).toMatchObject({ actedAgentUuids: [] });
    expect(mocks.result).toHaveBeenCalledOnce();
  });
  it("writes Knowledge without a run and excludes newly added targets from the frozen interaction", async () => {
    const f = fixture(false, false);
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    f.rawItem.system.information.push({ ...f.rawItem.system.information[0], id: "added" });
    expect(await adapter.resolveLaboratoryCommand(f.command(started, "finish"), f.requester)).toMatchObject({ terminal: { newCount: 2 } });
    expect(readPoiKnowledge(f.item)[0].informationIds).toEqual(["one", "two"]);
    expect(readPoiDiscoveries(f.item)).toEqual([]);
    expect(f.equipment.update).not.toHaveBeenCalled();
  });
  it.each([false, true])("cancels before/after start (%s) without granting or refunding", async started => {
    const f = fixture();
    let view = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    if (started) view = asView(await adapter.resolveLaboratoryCommand(f.command(view, "start"), f.requester));
    const cancel = f.command(view, "cancel");
    expect(await adapter.resolveLaboratoryCommand(cancel, f.requester)).toMatchObject({ terminal: { status: "cancelled" } });
    await adapter.resolveLaboratoryCommand(cancel, f.requester);
    expect(f.equipment.system.uses.value).toBe(started ? 1 : 2);
    expect(mocks.result).toHaveBeenCalledTimes(started ? 1 : 0);
    expect(readPoiKnowledge(f.item)).toEqual([]);
    expect(await adapter.resolveLaboratoryCommand(f.command(view, "start"), f.requester)).not.toMatchObject({ view: { state: "active" } });
    expect(mocks.equipment).toHaveBeenCalledTimes(started ? 1 : 0);
  });
  it("blocks other owners and Inventory during an active session, while manual adjustments remain serialized", async () => {
    const f = fixture(); adapter.registerLaboratoryQueries();
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    expect(await adapter.prepareLaboratory({ ...f.intent, operationId: "other" }, f.other)).toEqual({ status: "busy" });
    expect(await executor.executeEquipmentUse({ ...f.intent, operationId: "inventory" }, f.requester)).toEqual({ status: "busy" });
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    const { adjustOwnedEquipmentUses } = await import("./adjust-owned-equipment-uses");
    await adjustOwnedEquipmentUses(f.actors[0] as unknown as foundry.documents.Actor, "e", 1);
    rolls([2]);
    await adapter.resolveLaboratoryCommand(f.command(started, "reroll", [1]), f.requester);
    expect(f.equipment.system.uses.value).toBe(2);
    expect(f.equipment.update).toHaveBeenCalledTimes(2);
  });
  it.each([[], [0, 0], [-1], [4], [0.5], [0, 1, 2, 3]].map(positions => ({ positions })))(
    "rejects invalid positions $positions without rolling", async ({ positions }) => {
      const f = fixture();
      const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
      const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
      mocks.roll.mockClear();
      expect(await adapter.resolveLaboratoryCommand(f.command(started, "reroll", positions), f.requester)).toEqual({ status: "invalid" });
      expect(mocks.roll).not.toHaveBeenCalled();
    });
  it.each(["hidden", "owner", "removed", "run", "form", "mechanic", "length", "category"])(
    "invalidates a relevant document change: %s", async change => {
      const f = fixture();
      const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
      const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
      if (change === "hidden") f.flags.pointOfInterestVisibility = { mode: "gm", users: [], notified: [] };
      if (change === "owner") f.actors[0].testUserPermission.mockReturnValue(false);
      if (change === "removed") f.remove();
      if (change === "run") delete f.sceneFlags.investigationRuntime;
      if (change === "form") f.equipment.system.useForms = [];
      if (change === "mechanic") f.equipment.system.useForms[0].mechanic = "standard";
      if (change === "length") f.rawItem.system.information[0].approaches[0].mechanicConfig.sequenceLength = 5;
      if (change === "category") f.equipment.system.category = "general";
      const result = await adapter.resolveLaboratoryCommand(f.command(started, "finish"), f.requester);
      expect(result).not.toMatchObject({ terminal: { status: "success" } });
      expect(readPoiKnowledge(f.item)).toEqual([]);
      expect(f.equipment.system.uses.value).toBe(1);
    });
  it("retains a partially evaluated reroll and commits its full cost only once", async () => {
    const f = fixture();
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const started = asView(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester));
    mocks.roll.mockReset().mockResolvedValueOnce({ value: 1, serialized: {} }).mockRejectedValueOnce(new Error("roll failed"))
      .mockResolvedValueOnce({ value: 2, serialized: {} });
    const reroll = f.command(started, "reroll", [0, 2]);
    expect(await adapter.resolveLaboratoryCommand(reroll, f.requester)).toEqual({ status: "partial", stage: "analysis" });
    expect(await adapter.resolveLaboratoryCommand(f.command(started, "reroll", [1]), f.requester)).toEqual({ status: "invalid" });
    const recovered = asView(await adapter.resolveLaboratoryCommand(f.command(started, "get"), f.requester));
    expect(recovered).toMatchObject({ remaining: 3, results: [1, 2, 3, 4], pendingCommand: reroll });
    expect(asView(await adapter.resolveLaboratoryCommand(reroll, f.requester))).toMatchObject({ remaining: 1, results: [1, 2, 2, 4] });
    await adapter.resolveLaboratoryCommand(reroll, f.requester);
    expect(mocks.roll).toHaveBeenCalledTimes(3);
    expect(f.equipment.update).toHaveBeenCalledOnce();
  });
  it.each(["initial", "equipment-card", "knowledge", "result-card"])("recovers partial failure in %s without repeating confirmed steps", async stage => {
    const f = fixture();
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    const start = f.command(prepared, "start");
    if (stage === "initial") mocks.roll.mockReset().mockResolvedValueOnce({ value: 1, serialized: {} }).mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ value: 2, serialized: {} }).mockResolvedValueOnce({ value: 3, serialized: {} }).mockResolvedValueOnce({ value: 4, serialized: {} });
    if (stage === "equipment-card") mocks.equipment.mockRejectedValueOnce(new Error("card fail"));
    let result = await adapter.resolveLaboratoryCommand(start, f.requester);
    if (["initial", "equipment-card"].includes(stage)) {
      expect(result.status).toBe("partial");
      result = await adapter.resolveLaboratoryCommand(start, f.requester);
    }
    const started = asView(result);
    const finish = f.command(started, "finish");
    if (stage === "knowledge") {
      const write = f.rawItem.update.getMockImplementation()!;
      f.rawItem.update.mockImplementationOnce(async patch => { await write(patch); throw new Error("response lost after commit"); });
    }
    if (stage === "result-card") mocks.result.mockRejectedValueOnce(new Error("chat fail"));
    result = await adapter.resolveLaboratoryCommand(finish, f.requester);
    if (["knowledge", "result-card"].includes(stage)) {
      expect(result.status).toBe("partial");
      result = await adapter.resolveLaboratoryCommand(finish, f.requester);
    }
    expect(result).toMatchObject({ terminal: { status: "success", newCount: 2 } });
    expect(f.equipment.update).toHaveBeenCalledOnce();
    expect(f.rawItem.update).toHaveBeenCalledOnce();
    expect(mocks.roll).toHaveBeenCalledTimes(stage === "initial" ? 5 : 4);
  });
  it("rejects forgery, incompatible references and missing GM before payment", async () => {
    const f = fixture();
    expect(await adapter.prepareLaboratory(f.intent, { id: "owner", isGM: false } as foundry.documents.User)).toEqual({ status: "forbidden" });
    f.equipment.system.category = "general";
    expect(await adapter.prepareLaboratory(f.intent, f.requester)).toEqual({ status: "invalid" });
    f.equipment.system.category = "tool";
    const prepared = asView(await adapter.prepareLaboratory(f.intent, f.requester));
    expect(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.other)).toEqual({ status: "forbidden" });
    f.equipment.system.uses.value = 0;
    expect(await adapter.resolveLaboratoryCommand(f.command(prepared, "start"), f.requester)).toEqual({ status: "insufficient" });
    expect(f.equipment.update).not.toHaveBeenCalled();
    expect(mocks.equipment).not.toHaveBeenCalled();
    const inventory = { ...f.intent, operationId: "inventory" };
    expect(await executor.executeEquipmentUse(inventory, f.requester)).toEqual({ status: "insufficient" });
    f.equipment.system.uses.value = 2;
    expect(await executor.executeEquipmentUse(inventory, f.requester)).toEqual({ status: "contextRequired" });
    f.runtime.users.activeGM = { ...f.runtime.user, id: "new-gm" };
    expect(await adapter.resolveLaboratoryCommand(f.command(prepared, "get"), f.requester)).toEqual({ status: "forbidden" });
  });
});
