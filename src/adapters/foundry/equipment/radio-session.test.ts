import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RadioCommand, RadioResponse, RadioView } from "../../../application/equipment/radio-session";
import type { PoiToolIntent } from "../points-of-interest/use-poi-tool";
import { readPoiKnowledge } from "../points-of-interest/poi-runtime-state";
import { readPoiDiscoveries } from "../points-of-interest/poi-discovery";
const choices = { stepAdjustments: { mind: 0, technology: 0 }, extraDice: [], abilityUses: [] };
const mocks = vi.hoisted(() => ({ roll: vi.fn(), prepare: vi.fn(), confirm: vi.fn(), equipment: vi.fn(), check: vi.fn(), result: vi.fn() }));
vi.mock("../../../features/checks/resolve-agent-check-interaction", async importOriginal => ({
  ...await importOriginal<typeof import("../../../features/checks/resolve-agent-check-interaction")>(), prepareAgentCheckExecution: mocks.prepare,
}));
vi.mock("../../../features/checks/check-ability-uses", () => ({ confirmCheckAbilityUses: mocks.confirm, prepareCheckAbilityUses: vi.fn() }));
vi.mock("../dice/execute-foundry-check", () => ({ executeFoundryCheck: mocks.roll }));
vi.mock("../chat/publish-equipment-message", () => ({ publishEquipmentMessage: mocks.equipment }));
vi.mock("../chat/publish-radio-result", () => ({ publishRadioCheck: mocks.check, publishRadioResult: mocks.result }));
let adapter: typeof import("./radio-session");
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
  const approach = { type: "tool", equipmentUuid: "Item.source", useFormId: "tune",
    mechanicConfig: { type: "radio", trueFragments: ["O sinal", "vem", "do porão"], falseFragments: ["x", "y", "z", "w", "q"] } };
  const equipment = { id: "e", name: "Equipamento sem nome especial", type: "equipment", uuid: "Actor.a.Item.e", isEmbedded: true,
    _stats: { duplicateSource: "Item.source" }, actor: null as unknown,
    system: { category: "tool", quantity: 3, uses: { value: 2, max: 3 }, useForms: [
      { id: "tune", name: "Forma", description: "", consumesUse, mechanic: "radio" }] },
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
  vi.stubGlobal("CONFIG", { queries: {}, ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  const intent: PoiToolIntent = { actorUuid: "Actor.a", equipmentId: "e", useFormId: "tune", operationId: `lab-${++serial}`,
    context: { sceneId: "s", itemUuid: "Item.poi", runId: run ? "run" : null } };
  const requester = owner as foundry.documents.User;
  let counter = 0;
  const command = (view: RadioView, action: RadioCommand["action"], positions?: readonly string[]) => ({
    sessionId: view.sessionId, revision: view.revision, commandId: `command-${++counter}`, action,
    ...(action === "start" ? { choices, messageMode: "blind" } : {}),
    ...(positions ? { pieceId: positions[0] } : {}) });
  return { flags, sceneFlags, equipment, actors, item: item as unknown as foundry.documents.Item, rawItem: item, runtime,
    scene, requester, other: other as foundry.documents.User, intent, command, remove: () => { exists = false; } };
}
function asView(result: RadioResponse | null): RadioView {
  expect(result?.status).toBe("radio");
  if (!result || result.status !== "radio") throw new Error(JSON.stringify(result));
  return result.view;
}
beforeEach(async () => {
  vi.resetModules();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.prepare.mockReturnValue({ effectiveInput: { check: { kind: "skill", key: "technology" } }, selectedInput: {}, preparedAbilityUses: {} });
  mocks.confirm.mockResolvedValue([]); mocks.roll.mockResolvedValue({ result: { total: 13 }, roll: {} });
  mocks.equipment.mockResolvedValue(undefined); mocks.check.mockResolvedValue(undefined); mocks.result.mockResolvedValue(undefined);
  adapter = await import("./radio-session"); executor = await import("./execute-equipment-use");
});
afterEach(() => vi.unstubAllGlobals());
async function started(f: ReturnType<typeof fixture>) {
  const prepared = asView(await adapter.prepareRadio(f.intent, f.requester));
  return asView(await adapter.resolveRadioCommand(f.command(prepared, "start"), f.requester));
}
async function solved(f: ReturnType<typeof fixture>, initial: RadioView) {
  let view = initial;
  const truth = f.rawItem.system.information[0].approaches[0].mechanicConfig.trueFragments;
  for (const piece of [...view.active]) if (!truth.includes(piece.text))
    view = asView(await adapter.resolveRadioCommand({ ...f.command(view, "discard"), pieceId: piece.id }, f.requester));
  for (let i = 0; i < truth.length; i++) {
    const index = view.active.findIndex((piece, index) => index >= i && piece.text === truth[i]);
    const id = view.active[index].id;
    for (let j = index; j > i; j--) view = asView(await adapter.resolveRadioCommand({ ...f.command(view, "move"), pieceId: id, direction: -1 }, f.requester));
  }
  return view;
}
describe("authoritative radio sessions", () => {
  it("prepares without effects and never returns Check totals or private configuration", async () => {
    const f = fixture(); const prepared = await adapter.prepareRadio(f.intent, f.requester);
    expect(f.equipment.update).not.toHaveBeenCalled(); expect(mocks.roll).not.toHaveBeenCalled(); expect(mocks.equipment).not.toHaveBeenCalled();
    const view = asView(await adapter.resolveRadioCommand(f.command(asView(prepared), "start"), f.requester));
    expect(view.removedCount).toBe(5); expect(view.active).toHaveLength(3);
    expect(JSON.stringify(view)).not.toMatch(/total|result|trueFragments|falseFragments|Item.source|informationIds|Pista privada|Condição privada/);
    const resumed = await adapter.resumeRadio({ ...f.intent, operationId: "reconnected" }, f.requester);
    expect(asView(resumed)).toEqual(view); expect(mocks.roll).toHaveBeenCalledOnce();
    expect(mocks.check.mock.calls[0][4]).toBe("blind");
  });
  it("concurrently starts the last use only once and binds command parameters", async () => {
    const f = fixture(); executor.registerEquipmentSessionGuard(adapter.radioSessionGuard); f.equipment.system.uses.value = 1;
    const prepared = asView(await adapter.prepareRadio(f.intent, f.requester));
    expect(await adapter.prepareRadio({ ...f.intent, operationId: "other" }, f.other)).toEqual({ status: "busy" });
    const start = f.command(prepared, "start");
    const results = await Promise.all([adapter.resolveRadioCommand(start, f.requester), adapter.resolveRadioCommand(start, f.requester)]);
    expect(results[0]).toEqual(results[1]); expect(f.equipment.update).toHaveBeenCalledOnce(); expect(mocks.roll).toHaveBeenCalledOnce();
    expect(f.equipment.system.uses.value).toBe(0);
    expect(await adapter.resolveRadioCommand({ ...start, messageMode: "public" }, f.requester)).toEqual({ status: "invalid" });
    expect(await adapter.resolveRadioCommand({ ...f.command(asView(results[0]), "finish"), revision: 0 }, f.requester)).toEqual({ status: "invalid" });
  });
  it.each([false, true])("cancel %s after start preserves payments only when executed", async afterStart => {
    const f = fixture(); const prepared = asView(await adapter.prepareRadio(f.intent, f.requester));
    const view = afterStart ? asView(await adapter.resolveRadioCommand(f.command(prepared, "start"), f.requester)) : prepared;
    expect(await adapter.resolveRadioCommand(f.command(view, "cancel"), f.requester)).toMatchObject({ terminal: { status: "cancelled" } });
    expect(f.equipment.update).toHaveBeenCalledTimes(afterStart ? 1 : 0); expect(mocks.result).toHaveBeenCalledTimes(afterStart ? 1 : 0);
    expect(readPoiKnowledge(f.item)).toEqual([]);
  });
  it.each([true, false])("success writes isolated Knowledge and existing Discovery with active run %s", async run => {
    const f = fixture(run); const view = await solved(f, await started(f));
    expect(await adapter.resolveRadioCommand(f.command(view, "finish"), f.requester)).toMatchObject({ terminal: { status: "success", newCount: 2 } });
    expect(readPoiKnowledge(f.item)).toEqual([{ actorUuid: "Actor.a", informationIds: ["one", "two"] }]);
    expect(readPoiDiscoveries(f.item)).toHaveLength(run ? 2 : 0);
    expect(f.actors[0].update).not.toHaveBeenCalled(); expect(f.equipment.system.quantity).toBe(3);
    expect(JSON.stringify(mocks.result.mock.calls[0][2])).not.toMatch(/total|trueFragments|falseFragments|Pista privada|informationIds/);
  });
  it("failure concludes with zero discoveries and no revealed solution", async () => {
    const f = fixture(); let view = await started(f);
    view = asView(await adapter.resolveRadioCommand({ ...f.command(view, "discard"), pieceId: view.active[0].id }, f.requester));
    expect(await adapter.resolveRadioCommand(f.command(view, "finish"), f.requester)).toMatchObject({ view: { state: "failure" }, terminal: { newCount: 0 } });
    expect(readPoiKnowledge(f.item)).toEqual([]); expect(mocks.result).toHaveBeenCalledOnce();
  });
  it("freezes target IDs and excludes already-known and situational Information", async () => {
    const f = fixture(); f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.a", informationIds: ["one"] }] };
    const view = await solved(f, await started(f));
    f.rawItem.system.information.push({ ...f.rawItem.system.information[0], id: "later" });
    expect(await adapter.resolveRadioCommand(f.command(view, "finish"), f.requester)).toMatchObject({ terminal: { newCount: 1 } });
    expect(readPoiKnowledge(f.item)[0].informationIds).toEqual(["one", "two"]);
  });
  it.each(["owner", "visibility", "run", "form", "equipment", "config"])("revalidates %s before granting", async change => {
    const f = fixture(); const view = await solved(f, await started(f));
    if (change === "owner") f.actors[0].testUserPermission.mockReturnValue(false);
    if (change === "visibility") f.flags.pointOfInterestVisibility = { mode: "hidden", users: [], notified: [] };
    if (change === "run") delete f.sceneFlags.investigationRuntime;
    if (change === "form") f.equipment.system.useForms.length = 0;
    if (change === "equipment") f.remove();
    if (change === "config") for (const info of f.rawItem.system.information) info.approaches[0].mechanicConfig.trueFragments = ["Changed"];
    const result = await adapter.resolveRadioCommand(f.command(view, "finish"), f.requester);
    expect(result).not.toMatchObject({ terminal: { status: "success" } }); expect(readPoiKnowledge(f.item)).toEqual([]);
  });
  it("denies forged requester/Actor/context/tokens and unregistered modes", async () => {
    const f = fixture();
    expect(await adapter.prepareRadio(f.intent, { ...f.requester } as foundry.documents.User)).toEqual({ status: "forbidden" });
    expect(await adapter.prepareRadio({ ...f.intent, actorUuid: "Actor.b" }, f.requester)).toEqual({ status: "forbidden" });
    const prepared = asView(await adapter.prepareRadio(f.intent, f.requester));
    expect(await adapter.prepareRadio({ ...f.intent, context: { ...f.intent.context, itemUuid: "Item.other" } }, f.requester)).toEqual({ status: "invalid" });
    expect(await adapter.resolveRadioCommand(f.command(prepared, "start"), f.other)).toEqual({ status: "forbidden" });
    expect(await adapter.resolveRadioCommand({ ...f.command(prepared, "start"), messageMode: "unknown" }, f.requester)).toEqual({ status: "invalid" });
    expect(await adapter.resolveRadioCommand({ ...f.command(prepared, "start"), choices: { ...choices, extraDice: [{ id: "fake", label: "fake", die: 12, source: "ability" }] } }, f.requester)).toEqual({ status: "invalid" });
    const view = await started(f);
    expect(await adapter.resolveRadioCommand({ ...f.command(view, "discard"), pieceId: "private-token" }, f.requester)).toEqual({ status: "invalid" });
  });
  it("a partial Check publication retries without another payment, Roll or shuffle", async () => {
    const f = fixture(); const prepared = asView(await adapter.prepareRadio(f.intent, f.requester)); const start = f.command(prepared, "start");
    mocks.check.mockRejectedValueOnce(new Error("lost publication"));
    expect(await adapter.resolveRadioCommand(start, f.requester)).toMatchObject({ status: "partial" });
    expect(asView(await adapter.resolveRadioCommand(start, f.requester)).state).toBe("active");
    expect(mocks.roll).toHaveBeenCalledOnce(); expect(f.equipment.update).toHaveBeenCalledOnce(); expect(mocks.equipment).toHaveBeenCalledOnce();
  });
  it.each([false, true])("a rejected Knowledge update retries safely when committed %s", async committed => {
    const f = fixture(); const view = await solved(f, await started(f)); const finish = f.command(view, "finish");
    const write = f.rawItem.update.getMockImplementation()!;
    f.rawItem.update.mockImplementationOnce(async patch => { if (committed) await write(patch); throw new Error("lost write"); });
    expect(await adapter.resolveRadioCommand(finish, f.requester)).toEqual({ status: "partial", stage: "discovery" });
    expect(await adapter.prepareRadio({ ...f.intent, operationId: "new-operation" }, f.requester)).toEqual({ status: "busy" });
    expect(await adapter.resolveRadioCommand(finish, f.requester)).toMatchObject({ terminal: { newCount: 2 } });
    expect(f.rawItem.update).toHaveBeenCalledTimes(committed ? 1 : 2); expect(mocks.roll).toHaveBeenCalledOnce();
  });
  it("never automatically repeats ambiguous costs or dice and keeps standard no-context execution blocked", async () => {
    const f = fixture(); const prepared = asView(await adapter.prepareRadio(f.intent, f.requester)); const start = f.command(prepared, "start");
    mocks.confirm.mockRejectedValueOnce(new Error("ambiguous payment"));
    expect(await adapter.resolveRadioCommand(start, f.requester)).toEqual({ status: "uncertain" });
    expect(await adapter.resolveRadioCommand(start, f.requester)).toEqual({ status: "uncertain" });
    expect(mocks.confirm).toHaveBeenCalledOnce(); expect(mocks.roll).toHaveBeenCalledOnce();
    expect(await executor.executeEquipmentUse({ ...f.intent, operationId: "inventory" }, f.requester)).toEqual({ status: "contextRequired" });
  });
  it("blocks zero uses before Check and does not locally substitute a changed authority", async () => {
    const f = fixture(); f.equipment.system.uses.value = 0;
    const prepared = asView(await adapter.prepareRadio(f.intent, f.requester));
    expect(await adapter.resolveRadioCommand(f.command(prepared, "start"), f.requester)).toEqual({ status: "insufficient" });
    expect(mocks.roll).not.toHaveBeenCalled();
    f.runtime.users.activeGM = { ...f.runtime.user, id: "other-gm" };
    expect(await adapter.resolveRadioCommand(f.command(prepared, "get"), f.requester)).toEqual({ status: "forbidden" });
  });
  it.each(["known", "situational"])("a valid solution with only %s targets concludes with zero discoveries", async reason => {
    const f = fixture();
    if (reason === "known") f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.a", informationIds: ["one", "two"] }] };
    else f.rawItem.system.information.splice(0, 2);
    const view = await solved(f, await started(f));
    expect(await adapter.resolveRadioCommand(f.command(view, "finish"), f.requester)).toMatchObject({ terminal: { status: "success", newCount: 0 } });
    expect(f.rawItem.update).not.toHaveBeenCalled();
  });
  it("rejects absent or conflicting puzzle configuration without use or Check", async () => {
    const f = fixture();
    f.rawItem.system.information[1].approaches[0].mechanicConfig.trueFragments = ["Diferente"];
    expect(await adapter.prepareRadio(f.intent, f.requester)).toEqual({ status: "invalid" });
    f.rawItem.system.information.length = 0;
    expect(await adapter.prepareRadio(f.intent, f.requester)).toEqual({ status: "invalid" });
    expect(f.equipment.update).not.toHaveBeenCalled(); expect(mocks.roll).not.toHaveBeenCalled();
  });
  it("a new explicit use after failure rolls once again and names do not invalidate the current puzzle", async () => {
    const f = fixture(); let view = await started(f);
    f.equipment.name = "Outro nome"; f.equipment.system.useForms[0].name = "Renomeada";
    view = asView(await adapter.resolveRadioCommand({ ...f.command(view, "discard"), pieceId: view.active[0].id }, f.requester));
    expect(await adapter.resolveRadioCommand(f.command(view, "finish"), f.requester)).toMatchObject({ view: { state: "failure" } });
    const next = await started({ ...f, intent: { ...f.intent, operationId: "explicit-next-use" } });
    expect(next.sessionId).not.toBe(view.sessionId);
    expect(mocks.roll).toHaveBeenCalledTimes(2); expect(f.equipment.update).toHaveBeenCalledTimes(2);
  });
  it("terminal publication retries without duplicating grants or Check", async () => {
    const f = fixture(); const view = await solved(f, await started(f)); const finish = f.command(view, "finish");
    mocks.result.mockRejectedValueOnce(new Error("lost conclusion"));
    expect(await adapter.resolveRadioCommand(finish, f.requester)).toEqual({ status: "partial", stage: "publication" });
    expect(await adapter.resolveRadioCommand(finish, f.requester)).toMatchObject({ terminal: { newCount: 2 } });
    expect(f.rawItem.update).toHaveBeenCalledOnce(); expect(mocks.check).toHaveBeenCalledOnce(); expect(mocks.roll).toHaveBeenCalledOnce();
  });
  it("composes Radio and Laboratory reservations without replacing either guard", async () => {
    const f = fixture(); const laboratory = await import("./laboratory-session");
    laboratory.registerLaboratoryQueries(); adapter.registerRadioQueries();
    executor.registerEquipmentSessionGuard((input, requester) => laboratory.laboratorySessionGuard(input, requester)
      ?? adapter.radioSessionGuard(input, requester));
    const radio = asView(await adapter.prepareRadio(f.intent, f.requester));
    const radioConfig = structuredClone(f.rawItem.system.information[0].approaches[0].mechanicConfig);
    f.equipment.system.useForms[0].mechanic = "laboratory";
    for (const info of f.rawItem.system.information) (info.approaches[0] as unknown as { mechanicConfig: object }).mechanicConfig = { type: "laboratory", sequenceLength: 4 };
    const labIntent = { ...f.intent, operationId: "other-lab" };
    expect(await laboratory.prepareLaboratory(labIntent, f.requester)).toEqual({ status: "busy" });
    await adapter.resolveRadioCommand(f.command(radio, "cancel"), f.requester);
    const prepared = await laboratory.prepareLaboratory(labIntent, f.requester);
    expect(prepared.status).toBe("laboratory");
    f.equipment.system.useForms[0].mechanic = "radio";
    for (const info of f.rawItem.system.information) info.approaches[0].mechanicConfig = structuredClone(radioConfig);
    expect(await adapter.prepareRadio({ ...f.intent, operationId: "other-radio" }, f.requester)).toEqual({ status: "busy" });
    if (prepared.status !== "laboratory") throw new Error("Laboratory not prepared.");
    await laboratory.resolveLaboratoryCommand({ sessionId: prepared.view.sessionId, commandId: "cancel-lab", revision: prepared.view.revision, action: "cancel" }, f.requester);
    expect((await adapter.prepareRadio({ ...f.intent, operationId: "other-radio" }, f.requester)).status).toBe("radio");
    expect(mocks.roll).not.toHaveBeenCalled(); expect(f.equipment.update).not.toHaveBeenCalled();
  });
  it("serializes a manual uses adjustment with start and does not pay again on retry", async () => {
    const f = fixture(); const prepared = asView(await adapter.prepareRadio(f.intent, f.requester)); const start = f.command(prepared, "start");
    const { mutateOwnedEquipmentUses } = await import("./mutate-owned-equipment-uses");
    const [result, adjusted] = await Promise.all([adapter.resolveRadioCommand(start, f.requester),
      mutateOwnedEquipmentUses(f.actors[0] as unknown as foundry.documents.Actor, "e", { kind: "set", field: "value", value: 3 })]);
    expect(result.status).toBe("radio"); expect(adjusted).toBe(true); expect(f.equipment.system.uses.value).toBe(3);
    expect(await adapter.resolveRadioCommand(start, f.requester)).toEqual(result);
    expect(f.equipment.update).toHaveBeenCalledTimes(2); expect(mocks.roll).toHaveBeenCalledOnce();
  });
  it("retries Equipment publication before rolling and reports lost dice without another evaluation", async () => {
    const f = fixture(); const prepared = asView(await adapter.prepareRadio(f.intent, f.requester)); const start = f.command(prepared, "start");
    mocks.equipment.mockRejectedValueOnce(new Error("equipment publication"));
    expect(await adapter.resolveRadioCommand(start, f.requester)).toEqual({ status: "partial", stage: "publication" });
    expect(mocks.roll).not.toHaveBeenCalled(); mocks.roll.mockRejectedValueOnce(new Error("dice response lost"));
    expect(await adapter.resolveRadioCommand(start, f.requester)).toEqual({ status: "uncertain" });
    expect(await adapter.resolveRadioCommand(start, f.requester)).toEqual({ status: "uncertain" });
    expect(f.equipment.update).toHaveBeenCalledOnce(); expect(mocks.roll).toHaveBeenCalledOnce();
  });
  it("retains a pending cancellation for reconnects when its conclusion publication fails", async () => {
    const f = fixture(); const view = await started(f); const cancel = f.command(view, "cancel");
    mocks.result.mockRejectedValueOnce(new Error("cancel audit publication"));
    expect(await adapter.resolveRadioCommand(cancel, f.requester)).toEqual({ status: "partial", stage: "publication" });
    expect(asView(await adapter.resumeRadio({ ...f.intent, operationId: "reconnected" }, f.requester)).pendingCommand).toEqual(cancel);
    expect(await adapter.resolveRadioCommand(cancel, f.requester)).toMatchObject({ terminal: { status: "cancelled" } });
    expect(f.equipment.update).toHaveBeenCalledOnce(); expect(mocks.roll).toHaveBeenCalledOnce();
  });
});
