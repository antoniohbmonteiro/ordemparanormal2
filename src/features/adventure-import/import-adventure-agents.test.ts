import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PLAYTEST_ALPHA_ADVENTURE as definition } from "../../config/adventure-definitions/playtest-alpha";
import { PLAYTEST_ALPHA_AGENT_PRESETS as presets } from "../../config/adventure-agent-presets/playtest-alpha";
import { importAdventureAgents, AgentImportError } from "./import-adventure-agents";
import { createAdventureAgentActorPort } from "../../adapters/foundry/adventure-agent-actors";
import { prepareAdventureAgents, type AdventureAgentActorPort, type AgentPortableItem, type PreparedAdventureAgent, type PreparedAgentItem } from "./prepare-adventure-agents";
import { importFlag, preserveAbilityResourceValue, type AgentActorSource, type AgentImportFlag, type AgentItemSource } from "../../core/adventure-import/adventure-agent-reconciliation";
import type { PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";

const canonical = new Map<string, AgentPortableItem>();
for (const [pack, type] of [["profiles", "profile"], ["occupations", "occupation"], ["abilities", "ability"]] as const) {
  const directory = new URL(`../../../packs-src/${pack}/`, import.meta.url);
  for (const filename of readdirSync(directory)) {
    const item = JSON.parse(readFileSync(new URL(filename, directory), "utf8"));
    if (item.type !== type) continue;
    const uuid = `Compendium.ordemparanormal2.${pack}.Item.${item._id}`;
    canonical.set(uuid, { uuid, type, name: item.name, img: item.img, system: item.system, effects: item.effects });
  }
}
type MutableActor = { -readonly [K in keyof AgentActorSource]: AgentActorSource[K] } & { items: AgentItemSource[]; folder?: string; ownership?: unknown; sort?: number };
function harness(acts: ("actOne" | "actTwo")[] = ["actOne", "actTwo"]) {
  let counter = 0, authorized = true;
  const world: MutableActor[] = [];
  const writes: string[] = [];
  const actor = (id: string) => world.find(a => a._id === id)!;
  const marker = (agent: PreparedAdventureAgent) => ({ ordemparanormal2: { adventureImport: structuredClone(agent.flag) } });
  function item(i: PreparedAgentItem, a: PreparedAdventureAgent): AgentItemSource {
    return { _id: i.id, name: i.name, img: i.img, type: i.type, system: structuredClone(i.system), flags: {
      ordemparanormal2: { sourceUuid: i.uuid, ...(i.grant ? { profileGrant: { profileItemId: a.profileId, abilityUuid: i.uuid } }
        : { adventureImport: { importer: "actorItem", adventureId: a.flag.adventureId, documentId: a.flag.documentId, uuid: i.uuid, version: 1 } }) },
    } };
  }
  function update(a: MutableActor, p: PreparedAdventureAgent, initial = false) {
    a.img = p.img; a.prototypeToken = { ...a.prototypeToken, texture: { ...a.prototypeToken?.texture as object, src: p.token } };
    a.system = { ...a.system, level: p.preset.level, attributes: p.preset.attributes, skills: p.preset.skills,
      resources: { health: { ...(initial ? { value: p.preset.resources.healthMax } : (a.system.resources as { health: object }).health), max: p.preset.resources.healthMax },
        determination: { ...(initial ? { value: p.preset.resources.determinationMax } : (a.system.resources as { determination: object }).determination), max: p.preset.resources.determinationMax } } };
    a.flags = { ...a.flags, ...marker(p) };
  }
  const port: AdventureAgentActorPort = {
    isAuthorized: () => authorized, newId: () => `id${++counter}`, listActors: () => structuredClone(world),
    resolveCanonical: vi.fn(async (uuid, type) => { const source = canonical.get(uuid); if (!source || source.type !== type) throw new Error("missing canonical"); return structuredClone(source); }),
    validatePrepared: vi.fn(), prepareProfileAbilities: (_actor, _profileId, profile, abilities) => abilities.filter(a => (profile.system.abilityGrants as { uuid: string }[]).some(g => g.uuid === a.uuid)),
    ensureFolder: async act => { writes.push("folder"); return act; },
    createActor: async (p, folder) => { writes.push("createActor"); const a: MutableActor = { _id: `actor${++counter}`, type: "agent", name: p.preset.name, system: {}, items: [], folder }; update(a, p, true); world.push(a); return a._id; },
    updateActor: async (id, p) => { writes.push("updateActor"); update(actor(id), p); },
    createItems: async (id, items, p) => { writes.push("createItems"); actor(id).items.push(...items.map(i => item(i, p))); },
    updateItems: async (id, items, p) => { writes.push("updateItems"); const a = actor(id); for (const i of items) { const index = a.items.findIndex(old => old._id === i.id); const old = a.items[index]; a.items[index] = { ...old, ...item(i, p), system: i.type === "ability" ? preserveAbilityResourceValue(i.system, old.system) : structuredClone(i.system) }; } },
    deleteItems: async (id, ids) => { writes.push("deleteItems"); const a = actor(id); a.items = a.items.filter(i => !ids.includes(i._id)); },
    completeActor: async (id, flag) => { writes.push("completeActor"); actor(id).flags = { ordemparanormal2: { adventureImport: structuredClone(flag) } }; },
  };
  const pdf = { status: "recognized", passwordRequired: false, edition: "playtest-alpha-v1.1", facts: { parseAttempt: { status: "success" } } } as PdfSourceAnalysis;
  const decide = vi.fn(async () => "restore" as const);
  const input = { definition, presets, revision: 1, acts, pdf, actors: port, lookup: { worldId: "test", findExisting: async (dir: string, name: string) => `${dir}/${name}` }, decide };
  return { input, port, world, writes, decide, setAuthorized: (v: boolean) => { authorized = v; } };
}
function resource(a: MutableActor) { return a.system.resources as { health: { value: number; max: number }; determination: { value: number; max: number } }; }

describe("Adventure preset Actor import", () => {
  it.each([["actOne", 5], ["actTwo", 5], ["both", 10]] as const)("uses current materialization scope %s even with old assets available", async (scope, n) => {
    const h = harness(scope === "both" ? ["actOne", "actTwo"] : [scope]);
    const result = await importAdventureAgents(h.input);
    expect(result.created).toBe(n); expect(h.world).toHaveLength(n); expect(h.decide).not.toHaveBeenCalled();
  });
  it("checks every preset reference against current pack sources and keeps canonical Executor intact", async () => {
    const h = harness(); const plans = await prepareAdventureAgents(h.input);
    expect(plans).toHaveLength(10); expect(h.writes).toEqual([]);
    const amanda = plans.find(a => a.preset.id === "actTwo.amanda")!;
    expect(amanda.items.filter(i => i.name === "Avaliação")).toHaveLength(1);
    expect(amanda.items.find(i => i.name === "Avaliação")?.grant).toBe(true);
    expect(amanda.items.find(i => i.name === "Foco Mental (Aprimorado)")?.grant).toBe(false);
    const heitor = plans.find(a => a.preset.id === "actTwo.heitor")!;
    expect(heitor.items.find(i => i.type === "profile")?.system.abilityGrants).toEqual([{ uuid: presets[9].abilities[0].uuid }]);
    expect(heitor.items.filter(i => i.type === "ability").map(i => i.uuid)).toEqual(presets[9].abilities.map(i => i.uuid));
    expect(heitor.items.find(i => i.grant)?.system.resource).toEqual({ value: 0, max: 5 });
    expect(canonical.get(presets[9].profile.uuid)?.system.abilityGrants).toEqual([{ uuid: "Compendium.ordemparanormal2.abilities.Item.ability000000008" }]);
  });
  it.each([4, 9])("preflights the whole batch before writing when Agent index %i fails", async index => {
    const h = harness(); const validate = h.port.validatePrepared;
    h.port.validatePrepared = agent => { validate(agent); if (agent.preset.id === presets[index].id) throw new Error("invalid snapshot"); };
    await expect(importAdventureAgents(h.input)).rejects.toThrow("invalid snapshot"); expect(h.writes).toEqual([]);
  });
  it.each(["playtest-alpha-v1.0", "playtest-alpha-v1.1"])("uses the same presets for %s", async edition => {
    const h = harness(); h.input.pdf = { ...h.input.pdf, edition } as PdfSourceAnalysis;
    expect((await importAdventureAgents(h.input)).created).toBe(10);
  });
  it.each(["failed", "password-required", "not-attempted"])("requires usable PDF (%s)", async status => {
    const h = harness(); h.input.pdf = { ...h.input.pdf, facts: { parseAttempt: { status } } } as PdfSourceAnalysis;
    await expect(importAdventureAgents(h.input)).rejects.toThrow("PDF"); expect(h.writes).toEqual([]);
  });
  it("is idempotent; ignores manual homonyms, renames and gameplay changes; recreates deleted Actors", async () => {
    const h = harness(["actOne"]);
    h.world.push({ _id: "manual", type: "agent", name: presets[0].name, system: {}, items: [] });
    await importAdventureAgents(h.input);
    const a = h.world[1]; a.name = "Renamed"; resource(a).health.value = 999; a.folder = "manual-folder"; a.ownership = { default: 3 };
    h.writes.length = 0; const again = await importAdventureAgents(h.input);
    expect(again.unchanged).toBe(5); expect(h.writes).toEqual([]); expect(h.decide).not.toHaveBeenCalled();
    h.world.splice(1, 1); expect((await importAdventureAgents(h.input)).created).toBe(1); expect(h.world).toHaveLength(6);
  });
  it("asks once and preserves divergent Actors entirely, including flags", async () => {
    const h = harness(); await importAdventureAgents(h.input);
    h.world[0].system.level = 9; h.world[9].img = "custom.png";
    const before = structuredClone(h.world); h.writes.length = 0;
    const decide = vi.fn(async (_agents: readonly PreparedAdventureAgent[]) => "preserve" as const);
    const result = await importAdventureAgents({ ...h.input, decide });
    expect(decide).toHaveBeenCalledOnce(); expect(decide.mock.calls[0][0]).toHaveLength(2);
    expect(result.preserved).toBe(2); expect(h.world).toEqual(before); expect(h.writes).toEqual([]);
  });
  it("restores managed data while preserving runtime state, renamed Actor, token settings and manual Items", async () => {
    const h = harness(["actTwo"]); await importAdventureAgents(h.input);
    const a = h.world.find(a => importFlag(a)?.documentId === "actTwo.heitor")!;
    const impetus = a.items.find(i => i.name === "Ímpeto (Aprimorado)")!;
    (impetus.system.resource as { value: number; max: number }).value = 11; (impetus.system.resource as { max: number }).max = 99;
    a.name = "Renamed"; a.folder = "custom"; a.ownership = { default: 3 }; a.sort = 72;
    a.system.appearance = { accentColor: "#123456" }; a.system.level = 1; resource(a).health.value = 999;
    a.prototypeToken = { actorLink: false, name: "token", sight: { enabled: false }, texture: { src: "custom", scaleX: 2, tint: "#ABCDEF" } };
    const manual: AgentItemSource = { _id: "base", type: "ability", name: "Ímpeto manual", system: {}, flags: { ordemparanormal2: { sourceUuid: "Compendium.ordemparanormal2.abilities.Item.ability000000008" } } };
    a.items.push(manual, { _id: "equip", type: "equipment", name: "manual", system: {} });
    expect((await importAdventureAgents(h.input)).updated).toBe(1);
    expect(a.name).toBe("Renamed"); expect(a.folder).toBe("custom"); expect(a.ownership).toEqual({ default: 3 }); expect(a.sort).toBe(72);
    expect(a.system.appearance).toEqual({ accentColor: "#123456" }); expect(resource(a).health).toEqual({ value: 999, max: 34 });
    expect(a.items.find(i => i._id === impetus._id)?.system.resource).toEqual({ value: 11, max: 5 });
    expect(a.items.find(i => i._id === "base")).toEqual(manual); expect(a.items.some(i => i._id === "equip")).toBe(true);
    expect(a.prototypeToken).toMatchObject({ actorLink: false, name: "token", sight: { enabled: false }, texture: { scaleX: 2, tint: "#ABCDEF" } });
  });
  it("does not adopt manual same-origin Abilities; records manual satisfaction without a payload digest", async () => {
    const h = harness(["actTwo"]); await importAdventureAgents(h.input);
    const a = h.world.find(a => importFlag(a)?.documentId === "actTwo.amanda")!;
    const evaluation = a.items.find(i => i.name === "Avaliação")!;
    a.items = a.items.filter(i => i._id !== evaluation._id);
    const manual: AgentItemSource = { ...evaluation, _id: "manual-ability", name: "Custom", system: { custom: true }, flags: { ordemparanormal2: { sourceUuid: presets[8].abilities[0].uuid } } };
    a.items.push(manual); await importAdventureAgents(h.input);
    expect(a.items.filter(i => i._id === "manual-ability")).toEqual([manual]);
    const flag = importFlag(a) as unknown as AgentImportFlag;
    expect(flag.baseline?.manualUuids).toContain(presets[8].abilities[0].uuid);
    expect(flag.baseline?.items.some(i => i.id === manual._id)).toBe(false);
    manual.system.custom = false; h.writes.length = 0;
    await importAdventureAgents(h.input); expect(h.writes).toEqual([]);
  });
  it("updates changed canonical source/revision automatically against the last applied baseline", async () => {
    const h = harness(["actOne"]); await importAdventureAgents(h.input);
    const changed = presets.map(p => p.id === presets[0].id ? { ...p, level: 3 } : p);
    expect((await importAdventureAgents({ ...h.input, presets: changed, revision: 2 })).updated).toBe(5);
    expect(h.decide).not.toHaveBeenCalled(); expect(h.world[0].system.level).toBe(3);
  });
  it("cancels the entire Actor stage on dialog close before any write", async () => {
    const h = harness(); await importAdventureAgents(h.input); h.world[0].system.level = 10; h.writes.length = 0;
    expect((await importAdventureAgents({ ...h.input, decide: async () => null })).cancelled).toBe(true); expect(h.writes).toEqual([]);
  });
  it("stops stale decisions and authorization changes before overwriting", async () => {
    const h = harness(); await importAdventureAgents(h.input); h.world[0].system.level = 10; h.writes.length = 0;
    await expect(importAdventureAgents({ ...h.input, decide: async () => { h.world[0].system.level = 8; return "restore"; } })).rejects.toThrow("mudou"); expect(h.writes).toEqual([]);
    await expect(importAdventureAgents({ ...h.input, decide: async () => { h.setAuthorized(false); return "restore"; } })).rejects.toThrow("GM ativo mudou"); expect(h.writes).toEqual([]);
  });
  it("keeps incomplete state and reruns by identity after an operational Item failure", async () => {
    const h = harness(["actOne"]); const create = h.port.createItems;
    h.port.createItems = async (...args) => { await create(...args); throw new Error("database failed"); };
    await expect(importAdventureAgents(h.input)).rejects.toMatchObject({ stage: "items", counts: { created: 0 } });
    expect(h.world).toHaveLength(1); expect(importFlag(h.world[0])?.state).toBe("incomplete");
    h.port.createItems = create; expect((await importAdventureAgents(h.input)).updated).toBe(1);
    expect(h.world).toHaveLength(5); expect(h.decide).toHaveBeenCalledOnce();
    expect(new Set(h.world[0].items.map(i => i._id)).size).toBe(h.world[0].items.length);
  });
  it("blocks duplicate identities and multiple singleton Items as structural conflicts", async () => {
    const h = harness(); await importAdventureAgents(h.input);
    h.world.push({ ...structuredClone(h.world[0]), _id: "duplicate" }); h.writes.length = 0;
    await expect(importAdventureAgents(h.input)).rejects.toThrow("duplicada"); expect(h.writes).toEqual([]);
    h.world.pop(); h.world[0].items.push({ _id: "secondProfile", type: "profile", name: "manual", system: {} });
    await expect(importAdventureAgents(h.input)).rejects.toThrow("Múltiplos"); expect(h.writes).toEqual([]); expect(h.decide).not.toHaveBeenCalled();
  });
  it("rejects unexpected effective grants or replacements before writes", async () => {
    const h = harness(); const broken = presets.map(p => p.id === "actTwo.heitor" ? { ...p, profileGrantReplacements: undefined } : p);
    await expect(importAdventureAgents({ ...h.input, presets: broken })).rejects.toThrow(); expect(h.writes).toEqual([]);
  });
  it("recovers Alan after a failed restore while keeping two impetus charges and manual Items", async () => {
    const h = harness(["actOne"]); await importAdventureAgents(h.input);
    const alan = h.world.find(a => importFlag(a)?.documentId === "actOne.alan")!;
    const impetus = alan.items.find(i => i.name === "Ímpeto")!;
    (impetus.system.resource as { value: number }).value = 2;
    alan.system.appearance = { accentColor: "#123456" };
    alan.system.level = 9; (alan.system.skills as Record<string, unknown>).acrobatics = 12;
    const manual: AgentItemSource = { _id: "manual", type: "ability", name: "Manual", system: { custom: true } };
    alan.items.push(manual);
    const beforeManual = structuredClone(manual), originalIds = alan.items.map(i => i._id);
    const update = h.port.updateItems;
    h.port.updateItems = async (id, ...args) => {
      if (id === alan._id) throw new Error("Atualização de Items não confirmada.");
      await update(id, ...args);
    };
    await expect(importAdventureAgents(h.input)).rejects.toMatchObject({ stage: "items", agent: { actorId: alan._id } });
    expect(importFlag(alan)?.state).toBe("incomplete");
    expect(alan.system.level).toBe(2); expect((impetus.system.resource as { value: number }).value).toBe(2);
    h.port.updateItems = update;
    const updateActor = h.port.updateActor;
    const noOpUpdate = vi.fn(async () => undefined);
    vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
      actors: { get: () => ({ update: noOpUpdate, toObject: () => structuredClone(alan) }) } });
    const foundryPort = createAdventureAgentActorPort();
    h.port.updateActor = (id, agent) => id === alan._id ? foundryPort.updateActor(id, agent) : updateActor(id, agent);
    try {
      expect((await importAdventureAgents(h.input)).updated).toBe(1);
      expect(noOpUpdate).toHaveBeenCalledOnce();
    } finally {
      h.port.updateActor = updateActor;
      vi.unstubAllGlobals();
    }
    expect(importFlag(alan)?.state).toBe("complete");
    expect(alan.items.find(i => i._id === impetus._id)?.system.resource).toEqual({ ...canonical.get(presets[2].abilities[0].uuid)!.system.resource as object, value: 2 });
    expect(alan.system.skills).toEqual(presets[2].skills);
    expect(alan.items.map(i => i._id)).toEqual(originalIds);
    expect(alan.items.find(i => i._id === manual._id)).toEqual(beforeManual);
    const writes = h.writes.length;
    expect((await importAdventureAgents(h.input)).unchanged).toBe(5); expect(h.writes).toHaveLength(writes);
  });
  it("removes only importer-owned obsolete Abilities and preserves grants from a replacement manual Profile", async () => {
    const h = harness(["actTwo"]); await importAdventureAgents(h.input);
    const a = h.world.find(a => importFlag(a)?.documentId === "actTwo.amanda")!;
    a.items = a.items.filter(i => i.type !== "profile");
    const foreign: AgentItemSource = { _id: "foreignGrant", type: "ability", name: "Custom grant", system: { custom: true },
      flags: { ordemparanormal2: { profileGrant: { profileItemId: "manualProfile", abilityUuid: "Compendium.ordemparanormal2.abilities.Item.ability000000014" } } } };
    a.items.push({ _id: "manualProfile", type: "profile", name: "Manual selection", system: {} }, foreign);
    const changed = presets.map(p => p.id === "actTwo.amanda" ? { ...p, abilities: p.abilities.slice(0, 2) } : p);
    await importAdventureAgents({ ...h.input, presets: changed, revision: 2 });
    expect(a.items.find(i => i._id === "foreignGrant")).toEqual(foreign);
    expect(a.items.filter(i => i.type === "profile")).toHaveLength(1);
    expect(a.items.some(i => i._id === "manualProfile")).toBe(false);
    expect(a.items.some(i => i.name === "Foco Mental (Aprimorado)")).toBe(false);
  });
  it("ignores divergences outside the current Act", async () => {
    const h = harness(); await importAdventureAgents(h.input);
    const outside = h.world[9]; outside.system.level = 1; const before = structuredClone(outside); h.writes.length = 0;
    const result = await importAdventureAgents({ ...h.input, acts: ["actOne"] });
    expect(result.unchanged).toBe(5); expect(h.decide).not.toHaveBeenCalled(); expect(outside).toEqual(before); expect(h.writes).toEqual([]);
  });
  it("guards concurrent preflight and releases the guard after failure", async () => {
    const h = harness(); let release!: () => void;
    const firstResolve = h.port.resolveCanonical;
    const pause = new Promise<void>(r => { release = r; });
    h.port.resolveCanonical = async (...args) => { await pause; return firstResolve(...args); };
    const first = importAdventureAgents(h.input);
    await expect(importAdventureAgents(h.input)).rejects.toBeInstanceOf(AgentImportError);
    release(); await first; expect((await importAdventureAgents(h.input)).unchanged).toBe(10);
  });
});
