import { afterEach, beforeEach, expect, it, vi } from "vitest";
const publish = vi.hoisted(() => vi.fn());
const special = vi.hoisted(() => ({ roll: vi.fn(), check: vi.fn(), result: vi.fn(), removal: vi.fn() }));
vi.mock("../chat/publish-equipment-message", () => ({ publishEquipmentMessage: publish }));
vi.mock("../dice/execute-laboratory-roll", () => ({ executeLaboratoryRoll: special.roll }));
vi.mock("../dice/execute-foundry-check", () => ({ executeFoundryCheck: special.check }));
vi.mock("../chat/publish-laboratory-result", () => ({ publishLaboratoryResult: special.result }));
vi.mock("../chat/publish-radio-result", () => ({ publishRadioResult: special.result, publishRadioRemoval: special.removal }));
import { resolvePoiToolUse, type PoiToolIntent } from "./use-poi-tool";
import { readPoiKnowledge } from "./poi-runtime-state";
import { readPoiDiscoveries } from "./poi-discovery";
import { shareCandidates, transferShareClue } from "./investigation-share";
import { resolvePoiScene } from "./poi-runtime-queries";
import { useInvestigationTool } from "../../../features/points-of-interest/use-investigation-tool";
import { syntheticToolPresets } from "../../../qa/playtest-alpha-tools-fixture";
import { ACT_TWO_TOOL_SOURCES } from "../../../config/adventure-poi-sources/playtest-alpha-act-two-tools";

let sequence = 0;
function fixture(active = true) {
  const gm = { id: "gm", isGM: true, active: false };
  const requester = { id: "owner", isGM: false, active: false };
  const second = { id: "other", isGM: false, active: false };
  const users = [gm, requester, second];
  const flags: Record<string, unknown> = { pointOfInterestVisibility: { mode: "everyone", users: [], notified: [] } };
  const sceneFlags: Record<string, unknown> = { pointOfInterestItems: ["Item.poi"],
    ...(active ? { investigationRuntime: { schemaVersion: 1, runId: "run", round: 1, actedAgentUuids: [] } } : {}) };
  const tool = { type: "tool", equipmentUuid: "Item.source", useFormId: "scan" };
  const equipment = { id: "e", type: "equipment", uuid: "Actor.a.Item.e", isEmbedded: true,
    _stats: { duplicateSource: "Item.source" }, actor: null as unknown,
    system: { category: "tool", uses: { value: 3, max: 3 }, useForms: [
      { id: "scan", name: "Examinar", description: "", consumesUse: true }] },
    update: vi.fn(async (patch: Record<string, number>) => { equipment.system.uses.value = patch["system.uses.value"]; }) };
  const actors = ["a", "b", "c"].map(id => ({ uuid: `Actor.${id}`, type: "agent", name: id, img: "", isOwner: true,
    getEmbeddedDocument: () => id === "a" ? equipment : null,
    testUserPermission: vi.fn((user: { id: string }) => user.id === (id === "a" ? "owner" : "other")),
    update: vi.fn(), system: { resources: { determination: { value: 5 } } } }));
  equipment.actor = actors[0];
  const item = { uuid: "Item.poi", type: "pointOfInterest", name: "Local", isEmbedded: false, pack: null,
    ownership: { default: 0 }, testUserPermission: () => false,
    getFlag: (_scope: string, key: string) => flags[key],
    system: { information: [
      { id: "one", content: "Temperatura baixa.", approaches: [tool] },
      { id: "two", content: "Marcas.", approaches: [tool, { skill: "perception", difficulty: 6, showDifficultyToPlayers: true }] },
      { id: "conditional", content: "Privada", availability: { mode: "situational", condition: "Chave secreta" }, approaches: [tool] },
    ] },
    update: vi.fn(async (patch: Record<string, unknown>) => {
      for (const [path, value] of Object.entries(patch)) flags[path.split(".").at(-1)!] = value;
    }) };
  const scene = { id: "s", regions: [], tokens: actors.map((_, i) => ({ actorId: ["a", "b", "c"][i], actorLink: true })),
    getFlag: (_scope: string, key: string) => sceneFlags[key], update: vi.fn() };
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 } });
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, contents: users, get: (id: string) => users.find(u => u.id === id) },
    actors: { get: (id: string) => actors[["a", "b", "c"].indexOf(id)] },
    items: { get: (id: string) => id === "poi" ? item : null },
    scenes: { get: (id: string) => id === "s" ? scene : null } });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  const intent: PoiToolIntent = { actorUuid: "Actor.a", equipmentId: "e", useFormId: "scan",
    operationId: `context-${++sequence}`, context: { sceneId: "s", itemUuid: "Item.poi", runId: active ? "run" : null } };
  return { flags, sceneFlags, equipment, actors, item: item as unknown as foundry.documents.Item,
    scene: scene as unknown as foundry.documents.Scene, requester: requester as foundry.documents.User,
    second: second as foundry.documents.User, intent };
}
beforeEach(() => { publish.mockReset().mockResolvedValue(undefined); Object.values(special).forEach(mock => mock.mockReset()); });
afterEach(() => vi.unstubAllGlobals());

it("grants all new always answers to only the using Agent, with Discovery but without PD or acted state", async () => {
  const f = fixture();
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "success", newCount: 2, manual: false });
  expect(readPoiKnowledge(f.item)).toEqual([{ actorUuid: "Actor.a", informationIds: ["one", "two"] }]);
  expect(readPoiDiscoveries(f.item)).toEqual(["one", "two"].map(informationId => ({ runId: "run", actorUuid: "Actor.a", informationId })));
  expect(f.sceneFlags.investigationRuntime).toMatchObject({ actedAgentUuids: [] });
  expect(f.actors[0].system.resources.determination.value).toBe(5);
  expect(f.actors[0].update).not.toHaveBeenCalled();
  expect(f.equipment.system.uses.value).toBe(2);
  const replay = await resolvePoiToolUse(f.intent, f.requester);
  expect(replay).toEqual({ status: "success", newCount: 2, manual: false });
  expect(publish).toHaveBeenCalledOnce();
});
it("exposes discovered tool-only clues in the existing neutral Scene group and sharing flow", async () => {
  const f = fixture();
  await resolvePoiToolUse(f.intent, f.requester);
  const candidates = shareCandidates(f.scene, "run", "Actor.a");
  expect(candidates.map(candidate => candidate.reference)).toEqual(["one", "two"].map(informationId =>
    ({ kind: "poi", itemUuid: "Item.poi", informationId })));
  const projection = resolvePoiScene("s", f.requester, "Actor.a");
  expect("entries" in projection && projection.entries[0].knownGroups?.map(group => group.skill))
    .toEqual(["Informações descobertas", "perception"]);
  expect(await transferShareClue(f.scene, "run", "Actor.a", "Actor.b", candidates[0].reference)).toBe(true);
  expect(readPoiKnowledge(f.item)).toEqual([
    { actorUuid: "Actor.a", informationIds: ["one", "two"] }, { actorUuid: "Actor.b", informationIds: ["one"] },
  ]);
  expect(readPoiDiscoveries(f.item).some(entry => entry.actorUuid === "Actor.b")).toBe(false);
});
it("writes Knowledge alone without an active run", async () => {
  const f = fixture(false);
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "success", newCount: 2, manual: false });
  expect(readPoiKnowledge(f.item)).toHaveLength(1);
  expect(f.flags.pointOfInterestDiscovery).toBeUndefined();
});
it("executes authorized local usage without a GM and never reads the private POI", async () => {
  const f = fixture();
  const runtime = game as unknown as { user: foundry.documents.User; users: { activeGM: foundry.documents.User | null } };
  runtime.users.activeGM = null;
  runtime.user = f.requester;
  const privateRead = vi.spyOn(f.item, "getFlag");
  const result = await useInvestigationTool(f.actors[0] as unknown as foundry.documents.Actor, "e", f.intent.context);
  expect(result).toEqual({ status: "success", newCount: 0, manual: true });
  expect(privateRead).not.toHaveBeenCalled();
  expect(f.equipment.system.uses.value).toBe(2);
  expect(publish).toHaveBeenCalledOnce();
});
it("deduplicates existing knowledge without changing other Agents or discovering situational information", async () => {
  const f = fixture();
  f.flags.pointOfInterestKnowledge = { agents: [
    { actorUuid: "Actor.a", informationIds: ["one"] }, { actorUuid: "Actor.b", informationIds: ["conditional"] },
  ] };
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "success", newCount: 1, manual: false });
  expect(readPoiKnowledge(f.item)[1]).toEqual({ actorUuid: "Actor.b", informationIds: ["conditional"] });
  expect(readPoiDiscoveries(f.item).map(entry => entry.informationId)).toEqual(["two"]);
});
it.each(["already-known", "no-tool-approach", "situational-only"])(
  "returns a safe zero count after a valid use with %s information", async condition => {
    const f = fixture();
    const system = f.item.system as unknown as { information: { id: string; content: string; approaches: unknown[] }[] };
    if (condition === "already-known") f.flags.pointOfInterestKnowledge = {
      agents: [{ actorUuid: "Actor.a", informationIds: ["one", "two"] }],
    };
    if (condition === "no-tool-approach") system.information = [{ id: "skill-only", content: "Pista de perícia.", approaches: [
      { skill: "perception", difficulty: 6, showDifficultyToPlayers: true },
    ] }];
    if (condition === "situational-only") system.information = system.information.filter(entry => entry.id === "conditional");
    const before = readPoiKnowledge(f.item);
    const result = await resolvePoiToolUse(f.intent, f.requester);
    expect(result).toEqual({ status: "success", newCount: 0, manual: true });
    expect(readPoiKnowledge(f.item)).toEqual(before);
    expect(readPoiDiscoveries(f.item)).toEqual([]);
    expect(f.equipment.system.uses.value).toBe(2);
    expect(publish).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/approach|conditional|known|Privada|Chave secreta|equipmentUuid/);
  });
it.each(["no-match", "hidden", "removed", "stale-run", "no-origin"])(
  "completes and pays the normal use when contextual discovery is unavailable: %s", async condition => {
    const f = fixture();
    if (condition === "no-match") f.equipment._stats.duplicateSource = "Item.other";
    if (condition === "hidden") f.flags.pointOfInterestVisibility = { mode: "hidden" };
    if (condition === "removed") f.sceneFlags.pointOfInterestItems = [];
    if (condition === "stale-run") f.intent = { ...f.intent, context: { ...f.intent.context, runId: "old" } };
    if (condition === "no-origin") f.equipment._stats.duplicateSource = "";
    expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "success", newCount: 0, manual: true });
    expect(f.equipment.system.uses.value).toBe(2);
    expect(readPoiKnowledge(f.item)).toEqual([]);
    expect(publish).toHaveBeenCalledOnce();
  });
it("rejects a requester without OWNER and a forged operation context without leaking private answers", async () => {
  const f = fixture();
  expect(await resolvePoiToolUse(f.intent, f.second)).toEqual({ status: "forbidden" });
  expect(f.equipment.update).not.toHaveBeenCalled();
  await resolvePoiToolUse(f.intent, f.requester);
  const result = await resolvePoiToolUse({ ...f.intent, context: { ...f.intent.context, itemUuid: "Item.other" } }, f.requester);
  expect(result).toEqual({ status: "invalid" });
  expect(JSON.stringify(result)).not.toMatch(/Privada|Chave secreta|conditional|equipmentUuid/);
});

function specialFixture(mechanic: "laboratory" | "radio", consumesUse = false) {
  const f = fixture();
  Object.assign(f.equipment.system.useForms[0], { mechanic, consumesUse });
  const system = f.item.system as unknown as { information: unknown[] };
  system.information = [];
  const configure = (config: unknown) => { system.information = [{ id: "tool", content: "Pista contextual.", approaches: [{
    type: "tool", equipmentUuid: "Item.source", useFormId: "scan", ...(config === undefined ? {} : { mechanicConfig: config }),
  }] }]; };
  return { ...f, system, configure };
}
it.each(["laboratory", "radio"] as const)("completes an unconfigured %s as a manual use without special effects", async mechanic => {
  const f = specialFixture(mechanic);
  const expected = { status: "success", newCount: 0, manual: true };
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual(expected);
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual(expected);
  expect(f.equipment.update).not.toHaveBeenCalled();
  expect(f.item.update).not.toHaveBeenCalled();
  expect(f.actors[0].update).not.toHaveBeenCalled();
  expect(f.sceneFlags.investigationRuntime).toMatchObject({ actedAgentUuids: [] });
  expect(publish).toHaveBeenCalledOnce();
  Object.values(special).forEach(mock => expect(mock).not.toHaveBeenCalled());
  expect(readPoiKnowledge(f.item)).toEqual([]);
  expect(readPoiDiscoveries(f.item)).toEqual([]);
});
it.each(["laboratory", "radio"] as const)("retains the %s fallback receipt after publication failure and later authoring", async mechanic => {
  const f = specialFixture(mechanic, true);
  publish.mockRejectedValueOnce(new Error("Chat unavailable"));
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "partial", stage: "publication" });
  f.configure(mechanic === "laboratory" ? { type: "laboratory", sequenceLength: 4 }
    : { type: "radio", trueFragments: ["Mensagem"], falseFragments: [] });
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "success", newCount: 0, manual: true });
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "success", newCount: 0, manual: true });
  expect(f.equipment.update).toHaveBeenCalledOnce();
  expect(f.equipment.system.uses.value).toBe(2);
  expect(publish).toHaveBeenCalledTimes(2);
  expect(f.item.update).not.toHaveBeenCalled();
  expect(await resolvePoiToolUse({ ...f.intent, context: { ...f.intent.context, runId: null } }, f.requester))
    .toEqual({ status: "invalid" });
});
it.each(["laboratory", "radio"] as const)("rejects present but incompatible %s configuration before use", async mechanic => {
  for (const config of [undefined, { type: "laboratory", sequenceLength: 3 },
    { type: "radio", trueFragments: [], falseFragments: [] },
    mechanic === "radio" ? { type: "laboratory", sequenceLength: 4 }
      : { type: "radio", trueFragments: ["Mensagem"], falseFragments: [] }]) {
    const f = specialFixture(mechanic, true);
    f.configure(config);
    expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "invalid" });
    expect(f.equipment.update).not.toHaveBeenCalled();
  }
  expect(publish).not.toHaveBeenCalled();
});
it.each(["laboratory", "radio"] as const)("revalidates %s absence immediately before payment", async mechanic => {
  const f = specialFixture(mechanic, true);
  const uses = f.equipment.system.uses;
  Object.defineProperty(f.equipment.system, "uses", { get: () => {
    f.configure(mechanic === "laboratory" ? { type: "laboratory", sequenceLength: 4 }
      : { type: "radio", trueFragments: ["Mensagem"], falseFragments: [] });
    return uses;
  } });
  expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "invalid" });
  expect(f.equipment.update).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});
it.each(["laboratory", "radio"] as const)("does not turn unauthorized or malformed %s contexts into absence", async mechanic => {
  for (const condition of ["hidden", "stale", "malformed", "no-origin", "not-tool", "not-owner"]) {
    const f = specialFixture(mechanic);
    if (condition === "hidden") f.flags.pointOfInterestVisibility = { mode: "hidden" };
    if (condition === "stale") f.intent = { ...f.intent, context: { ...f.intent.context, runId: "old" } };
    if (condition === "malformed") f.system.information = [{}];
    if (condition === "no-origin") f.equipment._stats.duplicateSource = "";
    if (condition === "not-tool") f.equipment.system.category = "other";
    const result = await resolvePoiToolUse(f.intent, condition === "not-owner" ? f.second : f.requester);
    expect(result.status).toBe(condition === "not-owner" ? "forbidden" : "invalid");
    expect(f.item.update).not.toHaveBeenCalled();
  }
  expect(publish).not.toHaveBeenCalled();
});

it.each([["laboratory", "actTwo.map.23"], ["radio", "actTwo.map.07"]] as const)(
  "uses the imported %s/%s manual exception without Knowledge or a special session", async (mechanic, poiId) => {
    const f = specialFixture(mechanic);
    const source = ACT_TWO_TOOL_SOURCES[mechanic];
    Object.assign(f.equipment._stats, { compendiumSource: source.equipmentUuid });
    f.equipment.system.useForms[0].id = source.useFormId;
    f.intent = { ...f.intent, useFormId: source.useFormId };
    f.system.information = [...structuredClone(syntheticToolPresets().find(preset => preset.id === poiId)!.information)];
    expect(await resolvePoiToolUse(f.intent, f.requester)).toEqual({ status: "success", newCount: 0, manual: true });
    expect(f.item.update).not.toHaveBeenCalled();
    expect(f.equipment.update).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledOnce();
    Object.values(special).forEach(mock => expect(mock).not.toHaveBeenCalled());
  });

it.each(["laboratory", "radio"] as const)("serializes two owners' manual %s use of the last resource", async mechanic => {
  const f = specialFixture(mechanic, true);
  f.actors[0].testUserPermission.mockReturnValue(true);
  f.equipment.system.uses.value = 1;
  const results = await Promise.all([
    resolvePoiToolUse(f.intent, f.requester), resolvePoiToolUse({ ...f.intent, operationId: `other-${sequence}` }, f.second),
  ]);
  expect(results.map(result => result.status)).toEqual(["success", "insufficient"]);
  expect(f.equipment.update).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledOnce();
});
