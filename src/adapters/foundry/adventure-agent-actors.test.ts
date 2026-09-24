import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdventureAgentActorPort, portableSystemUpdate } from "./adventure-agent-actors";
import { PLAYTEST_ALPHA_AGENT_PRESETS } from "../../config/adventure-agent-presets/playtest-alpha";
import { PLAYTEST_ALPHA_AGENT_SOURCES } from "../../config/adventure-agent-sources/playtest-alpha";
import type { PreparedAdventureAgent, PreparedAgentItem } from "../../features/adventure-import/prepare-adventure-agents";
import { stableSerialize, type AgentActorSource } from "../../core/adventure-import/adventure-agent-reconciliation";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), resolve: vi.fn() }));
vi.mock("./items/single-item-catalog", () => ({ loadAvailableSingleItems: mocks.catalog, resolveSingleItemCatalogSource: mocks.resolve }));
const uuid = "Compendium.ordemparanormal2.abilities.Item.ability000000018";
const entry = { uuid, source: { kind: "compendium", packId: "ordemparanormal2.abilities", documentId: "ability000000018" } };
let source: Record<string, unknown>;
class ForcedDeletion {}
function applyActorUpdate(actor: AgentActorSource, changes: Record<string, unknown>) {
  for (const [path, value] of Object.entries(changes)) {
    const parts = path.split(".");
    let target = actor as unknown as Record<string, unknown>;
    for (const part of parts.slice(0, -1)) {
      target[part] ??= {};
      target = target[part] as Record<string, unknown>;
    }
    if (value instanceof ForcedDeletion) delete target[parts.at(-1)!];
    else target[parts.at(-1)!] = structuredClone(value);
  }
}
beforeEach(() => {
  source = { id: "ability000000018", uuid, type: "ability", isEmbedded: false, name: "Ímpeto (Aprimorado)", img: "source.png",
    toObject: () => ({ system: { resource: { value: 0, max: 5 }, uses: [] }, effects: [] }) };
  mocks.catalog.mockReset().mockResolvedValue([entry]); mocks.resolve.mockReset().mockImplementation(async () => source);
  vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: { contents: [], get: vi.fn() }, folders: { contents: [] } });
  vi.stubGlobal("foundry", { utils: { deepClone: structuredClone, randomID: () => "id" }, data: { operators: { ForcedDeletion } } });
});
afterEach(() => vi.unstubAllGlobals());
describe("Foundry Adventure Actor boundary", () => {
  it("uses exact system catalog UUIDs; never matches names or adopts World entries", async () => {
    const port = createAdventureAgentActorPort();
    expect(await port.resolveCanonical(uuid, "ability")).toMatchObject({ uuid, system: { resource: { value: 0, max: 5 } } });
    expect(mocks.resolve).toHaveBeenCalledWith(entry.source, expect.objectContaining({ itemType: "ability" }));
    mocks.catalog.mockResolvedValue([{ ...entry, source: { kind: "world", documentId: "manual" } }]);
    await expect(createAdventureAgentActorPort().resolveCanonical(uuid, "ability")).rejects.toThrow("indisponível");
  });
  it.each([{ ...entry, uuid: `${uuid}-other` }, { ...entry, source: { ...entry.source, packId: "other.abilities" } }])("rejects unavailable or foreign sources", async candidate => {
    mocks.catalog.mockResolvedValue([candidate]); await expect(createAdventureAgentActorPort().resolveCanonical(uuid, "ability")).rejects.toThrow();
  });
  it.each([{ isEmbedded: true }, { type: "equipment" }, { uuid: "Item.other" }, { id: "different" }])("rejects an invalid resolved source (%j)", async changes => {
    Object.assign(source, changes); await expect(createAdventureAgentActorPort().resolveCanonical(uuid, "ability")).rejects.toThrow();
  });
  it("rejects duplicate exact catalog references", async () => {
    mocks.catalog.mockResolvedValue([entry, entry]); await expect(createAdventureAgentActorPort().resolveCanonical(uuid, "ability")).rejects.toThrow("ambígua");
  });
  it("reconciles optional resource containers and removes obsolete portable fields", () => {
    expect(portableSystemUpdate({ resource: { value: 8, max: 5 }, uses: [] }, { resource: { value: 8, max: 99, extra: true }, legacy: 1 })).toEqual({
      "system.legacy": expect.any(ForcedDeletion), "system.resource.extra": expect.any(ForcedDeletion), "system.resource.value": 8, "system.resource.max": 5, "system.uses": [],
    });
    expect(portableSystemUpdate({ resource: null }, { resource: { value: 8, max: 5 } })).toEqual({ "system.resource": null });
  });
  it("updates only managed Actor paths and preserves source accent and gameplay state", async () => {
    const preset = PLAYTEST_ALPHA_AGENT_PRESETS[9];
    const agent = { preset, img: "portrait.png", token: "token.png", flag: { state: "incomplete" } } as PreparedAdventureAgent;
    const serialized = { system: { appearance: { accentColor: "#123456" } }, items: [], flags: { ordemparanormal2: { adventureImport: agent.flag } } } as unknown as AgentActorSource;
    const update = vi.fn(async (changes: Record<string, unknown>) => { applyActorUpdate(serialized, changes); return {}; });
    const actor = { update, toObject: () => serialized };
    vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: { get: () => actor } });
    await createAdventureAgentActorPort().updateActor("actor", agent);
    expect(update).toHaveBeenCalledWith({ "flags.ordemparanormal2.adventureImport": agent.flag, "system.level": preset.level,
      ...Object.fromEntries(Object.entries(preset.attributes).map(([k, v]) => [`system.attributes.${k}`, v])),
      ...Object.fromEntries(Object.entries(preset.skills).map(([k, v]) => [`system.skills.${k}`, v])), "system.resources.health.max": 34, "system.resources.determination.max": 20,
      img: "portrait.png", "prototypeToken.texture.src": "token.png" });
  });
  it("confirms a restored incomplete Alan even when a recovery update returns undefined", async () => {
    const source = PLAYTEST_ALPHA_AGENT_SOURCES.find(p => p.documentId === "actOne.alan")!;
    const preset = PLAYTEST_ALPHA_AGENT_PRESETS.find(p => p.key === source.presetKey)!;
    const flag = { importer: "actor", adventureId: "playtest-alpha", documentId: source.documentId, version: 1,
      presetId: source.documentId, presetRevision: 1, edition: "playtest-alpha-v1.1", act: source.act,
      portraitAssetId: source.portraitAssetId, tokenAssetId: source.tokenAssetId, state: "incomplete" };
    const agent = { preset, img: "portrait.png", token: "token.png", flag } as PreparedAdventureAgent;
    const serialized: AgentActorSource = { _id: "alan", type: "agent", name: "Renamed Alan", img: agent.img,
      system: { level: 9, attributes: structuredClone(preset.attributes), skills: structuredClone(preset.skills),
        resources: { health: { value: 2, max: 99 }, determination: { value: 3, max: 99 } }, appearance: { accentColor: "#123456" } },
      prototypeToken: { name: "Custom token", actorLink: false, sight: { enabled: true }, texture: { src: agent.token, scaleX: 2, tint: "#ABCDEF" } },
      flags: { ordemparanormal2: { adventureImport: flag }, unrelated: { preserved: true } },
      items: [{ _id: "manual", type: "ability", name: "Manual", system: { resource: { value: 2, max: 5 } } }] };
    const before = structuredClone(serialized);
    const update = vi.fn(async (changes: Record<string, unknown>) => {
      const previous = stableSerialize(serialized);
      applyActorUpdate(serialized, changes);
      // Schema cleaning materializes persisted fields independently of payload order.
      serialized.system.attributes = Object.fromEntries(Object.entries(serialized.system.attributes as Record<string, unknown>).reverse());
      serialized.system.occupation = "";
      return previous === stableSerialize(serialized) ? undefined : {};
    });
    vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: { get: () => ({ update, toObject: () => serialized }) } });
    const port = createAdventureAgentActorPort();
    await expect(port.updateActor("alan", agent)).resolves.toBeUndefined();
    expect(serialized.system.level).toBe(2);
    expect(serialized.system.resources).toEqual({ health: { value: 2, max: 10 }, determination: { value: 3, max: 16 } });
    expect(serialized.name).toBe(before.name); expect(serialized.items).toEqual(before.items);
    expect(serialized.prototypeToken).toEqual(before.prototypeToken); expect(serialized.system.appearance).toEqual(before.system.appearance);
    await expect(port.updateActor("alan", agent)).resolves.toBeUndefined();
    expect(await update.mock.results[1].value).toBeUndefined();
  });
  it.each([
    ["system.level", 9], ["system.attributes.mind", 12], ["system.skills.acrobatics", 12],
    ["system.skills.aptitude.arts", 12], ["system.resources.health.max", 99], ["system.resources.determination.max", 99],
    ["img", "modified.png"], ["prototypeToken.texture.src", "modified.png"],
    ["flags.ordemparanormal2.adventureImport.state", "complete"],
    ["flags.ordemparanormal2.adventureImport.presetRevision", 99],
  ])("rejects an unapplied Actor restore and identifies %s even with a truthy update result", async (path, value) => {
    const preset = PLAYTEST_ALPHA_AGENT_PRESETS.find(p => p.key === "agent-03")!;
    const agent = { preset, img: "portrait.png", token: "token.png", flag: { state: "incomplete", presetRevision: 1 } } as PreparedAdventureAgent;
    const serialized: AgentActorSource = { _id: "alan", type: "agent", name: "Alan", img: agent.img,
      system: { level: preset.level, attributes: structuredClone(preset.attributes), skills: structuredClone(preset.skills),
        resources: { health: { value: 2, max: 10 }, determination: { value: 3, max: 16 } }, appearance: { accentColor: "#123456" } },
      prototypeToken: { texture: { src: agent.token } }, items: [], flags: { ordemparanormal2: { adventureImport: structuredClone(agent.flag) } } };
    applyActorUpdate(serialized, { [path]: value });
    vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: { get: () => ({ update: async () => ({}), toObject: () => serialized }) } });
    await expect(createAdventureAgentActorPort().updateActor("alan", agent)).rejects.toThrow(`Campo: ${path}.`);
  });
  it.each([false, true])("uses v14 forced deletion for provenance, preserving two charges (grant=%s)", async grant => {
    const item: PreparedAgentItem = { id: "ability", uuid, type: "ability", name: "Canonical", img: "ability.png",
      system: { resource: { value: 0, max: 5 }, uses: [] }, existing: true, grant };
    const agent = { profileId: "profile", flag: { adventureId: "playtest-alpha", documentId: "actOne.alan" } } as PreparedAdventureAgent;
    const obsolete = grant ? "adventureImport" : "profileGrant";
    const persisted = { _id: item.id, type: item.type, name: "Modified", img: "modified.png",
      system: { resource: { value: 2, max: 99, extra: true }, uses: [], legacy: true },
      flags: { ordemparanormal2: { sourceUuid: uuid, [obsolete]: { obsolete: true }, unrelated: "preserved" } }, effects: [{ name: "preserved" }] };
    const manual = { _id: "manual", name: "Manual", type: "ability", system: {}, flags: {} };
    const items = new Map([[item.id, { toObject: () => persisted }], ["manual", { toObject: () => manual }]]);
    const updateEmbeddedDocuments = vi.fn(async (_type: string, updates: Record<string, unknown>[]) => {
      expect(updates).toHaveLength(1);
      for (const [path, value] of Object.entries(updates[0])) {
        expect(path.split(".").some(key => key.startsWith("-="))).toBe(false);
        if (path === "_id") continue;
        const parts = path.split(".");
        let target = persisted as unknown as Record<string, unknown>;
        for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
        const key = parts.at(-1)!;
        if (value instanceof ForcedDeletion) delete target[key]; else target[key] = structuredClone(value);
      }
      return [];
    });
    vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: { get: () => ({ items, updateEmbeddedDocuments }) } });
    const beforeManual = structuredClone(manual);
    await createAdventureAgentActorPort().updateItems("actor", [item], agent);
    const update = updateEmbeddedDocuments.mock.calls[0][1][0];
    expect(update[`flags.ordemparanormal2.${obsolete}`]).toBeInstanceOf(ForcedDeletion);
    expect(update["system.resource.value"]).toBe(2);
    expect(persisted.system.resource).toEqual({ value: 2, max: 5 });
    expect(persisted.flags.ordemparanormal2).not.toHaveProperty(obsolete);
    expect(persisted.flags.ordemparanormal2.unrelated).toBe("preserved");
    expect(persisted.effects).toEqual([{ name: "preserved" }]); expect(manual).toEqual(beforeManual);
  });
  it("accepts unchanged persisted Items when Foundry returns no updates, but rejects an unapplied restore", async () => {
    const item: PreparedAgentItem = { id: "ability", uuid, type: "ability", name: "Canonical", img: "ability.png",
      system: { resource: { value: 0, max: 5 }, uses: [] }, existing: true, grant: true };
    const agent = { profileId: "profile", flag: { adventureId: "playtest-alpha", documentId: "actOne.alan" } } as PreparedAdventureAgent;
    const persisted = { ...item, _id: item.id, system: { resource: { value: 2, max: 5 }, uses: [] }, flags: { ordemparanormal2: {
      sourceUuid: uuid, profileGrant: { profileItemId: "profile", abilityUuid: uuid },
    } } };
    const updateEmbeddedDocuments = vi.fn(async () => []);
    const items = new Map([[item.id, { toObject: () => persisted }]]);
    vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: { get: () => ({ items, updateEmbeddedDocuments }) } });
    const port = createAdventureAgentActorPort();
    await expect(port.updateItems("actor", [item], agent)).resolves.toBeUndefined();
    expect(persisted.system.resource.value).toBe(2);
    persisted.name = "Modified";
    await expect(port.updateItems("actor", [item], agent)).rejects.toThrow("Atualização de Items não confirmada");
  });
  it("confirms obsolete grant removal through the Profile feature without removing manual Items", async () => {
    const grant = { type: "ability", toObject: () => ({ flags: { ordemparanormal2: { profileGrant: { profileItemId: "profile", abilityUuid: uuid } } } }) };
    const items = new Map<string, unknown>([["grant", grant], ["manual", { type: "equipment" }]]);
    const deleted = vi.fn(async (_type: string, ids: string[]) => { for (const id of ids) items.delete(id); return ids.map(id => ({ id })); });
    const actor = { items, deleteEmbeddedDocuments: deleted };
    vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, actors: { get: () => actor } });
    await createAdventureAgentActorPort().deleteItems("actor", ["grant"]);
    expect(items.has("manual")).toBe(true); expect(items.has("grant")).toBe(false);
    expect(deleted).toHaveBeenCalledExactlyOnceWith("Item", ["grant"]);
  });
});
