import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { poiSystem, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";
import type { AdventureFolderPlacementFlag } from "../../features/adventure-import/adventure-folders";
import type { PoiImportFlag } from "../../features/adventure-import/import-adventure-pois";
import { createAdventurePoiItemPort } from "./adventure-poi-items";

class Replacement {
  static create(value: unknown) { return new Replacement(value); }
  constructor(readonly value: unknown) {}
}

type ItemData = Record<string, unknown> & {
  name: string; img: string; type: string; folder: string | null;
  system: Record<string, unknown>;
  flags: Record<string, Record<string, unknown>>;
};

const world: NativeItem[] = [];
let sanitizeHtmlOnUpdate = false;
let alterInformationOnUpdate = false;
let alterImportFlagOnUpdate = false;
function sanitizeHtmlLikeFoundry(value: string): string {
  return value.replace(/&quot;/gu, '"').replace(/&#39;/gu, "'");
}
function makePreset(id: string): AdventurePoiPreset { return { id, act: "actOne", name: "POI sintético",
  publicDescription: "<p>Descrição</p>", gmContext: "Contexto", information: [] }; }
const create = vi.fn(async (data: ItemData) => {
  const item = new NativeItem({ ...structuredClone(data), _id: `item-${world.length + 1}` });
  world.push(item);
  return item;
});

class NativeItem {
  static implementation = NativeItem;
  static create = create;
  constructor(readonly data: ItemData) {}
  get id() { return this.data._id as string | null; }
  get type() { return this.data.type; }
  get img() { return this.data.img; }
  get folder() { return this.data.folder ? { id: this.data.folder } : null; }
  toObject() { return structuredClone(this.data); }
  validate() { return true; }
  getFlag(scope: string, key: string) { return this.data.flags?.[scope]?.[key]; }
  async update(changes: Record<string, unknown>) {
    for (const [path, raw] of Object.entries(changes)) {
      const parts = path.split(".");
      let target: Record<string, unknown> = this.data;
      for (const part of parts.slice(0, -1)) {
        target[part] ??= {};
        target = target[part] as Record<string, unknown>;
      }
      target[parts.at(-1)!] = structuredClone(raw instanceof Replacement ? raw.value : raw);
    }
    if (sanitizeHtmlOnUpdate) {
      for (const key of ["publicDescription", "gmContext"] as const) {
        this.data.system[key] = sanitizeHtmlLikeFoundry(this.data.system[key] as string);
      }
    }
    if (alterInformationOnUpdate) {
      const information = this.data.system.information as Array<{ approaches: Array<{ difficulty: number }> }>;
      information[2].approaches[0].difficulty++;
    }
    if (alterImportFlagOnUpdate) {
      (this.data.flags.ordemparanormal2.adventureImport as { state: string }).state = "complete";
    }
  }
}

beforeEach(() => {
  world.length = 0;
  create.mockClear();
  sanitizeHtmlOnUpdate = false;
  alterInformationOnUpdate = false;
  alterImportFlagOnUpdate = false;
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } });
  vi.stubGlobal("game", { user: { isGM: true, id: "gm" }, users: { activeGM: { id: "gm" } },
    items: { contents: world, get: (id: string) => world.find(item => item.id === id) } });
  vi.stubGlobal("foundry", { documents: { Item: NativeItem }, data: { operators: { ForcedReplacement: Replacement } } });
});

afterEach(() => vi.unstubAllGlobals());

describe("Foundry Adventure POI Item adapter", () => {
  it("reports safe field paths and metadata when HTML entities change during persistence", async () => {
    const preset = { ...makePreset("actOne.map.09"),
      publicDescription: "<p>Um &quot;texto&quot; &amp; &lt;sinal&gt;.</p>",
      gmContext: "<p>Outro &#39;texto&#39;.</p>" };
    const flag: PoiImportFlag = { importer: "pointOfInterest", adventureId: "playtest-alpha", documentId: preset.id,
      act: preset.act, version: 1, presetRevision: 3, state: "incomplete" };
    const placement: AdventureFolderPlacementFlag = { version: 1, adventureId: "playtest-alpha",
      documentType: "Item", documentId: preset.id, act: preset.act, folderId: "pointsOfInterest" };
    const port = createAdventurePoiItemPort();
    const id = await port.createItem(preset, "icons/svg/item-bag.svg", "poi-folder", flag, placement);
    sanitizeHtmlOnUpdate = true;
    const error = await port.updateItem(id, poiSystem(preset), flag).catch((cause: Error) => cause) as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(`Atualização do POI não confirmada: ${id} (${preset.id})`);
    expect(error.message).toContain("system.publicDescription");
    expect(error.message).toContain("system.gmContext");
    expect(error.message).toContain("expectedLength=");
    expect(error.message).toContain("persistedLength=");
    expect(error.message).toContain("firstDifference=");
    expect(error.message).toContain("expectedCodePoint=0026, persistedCodePoint=0022");
    expect(error.message).toContain("entityNormalization=&quot;→U+0022");
    expect(error.message).not.toContain("Um &quot;texto&quot;");
    expect(error.message).not.toContain("Outro &#39;texto&#39;");
  });

  it("reports nested information paths without disclosing content", async () => {
    const preset = { ...makePreset("actOne.map.09"), information: Array.from({ length: 3 }, (_, index) => ({
      id: `clue-${index}`, content: `Texto privado ${index}`,
      availability: { mode: "always" as const, condition: "" as const }, approaches: [
        { skill: "perception" as const, difficulty: 6, showDifficultyToPlayers: false },
      ],
    })) };
    const flag: PoiImportFlag = { importer: "pointOfInterest", adventureId: "playtest-alpha", documentId: preset.id,
      act: preset.act, version: 1, presetRevision: 3, state: "incomplete" };
    const placement: AdventureFolderPlacementFlag = { version: 1, adventureId: "playtest-alpha",
      documentType: "Item", documentId: preset.id, act: preset.act, folderId: "pointsOfInterest" };
    const port = createAdventurePoiItemPort();
    const id = await port.createItem(preset, "icons/svg/item-bag.svg", "poi-folder", flag, placement);
    alterInformationOnUpdate = true;
    alterImportFlagOnUpdate = true;
    const error = await port.updateItem(id, poiSystem(preset), flag).catch((cause: Error) => cause) as Error;
    expect(error.message).toContain("system.information[2].approaches[0].difficulty");
    expect(error.message).toContain("flags.ordemparanormal2.adventureImport.state");
    expect(error.message).not.toContain("Texto privado");
  });

  it("confirms canonical HTML updates and retains runtime and manual fields", async () => {
    const preset = { ...makePreset("actOne.map.09"),
      publicDescription: `<p>Um "texto", d'água &amp; &lt;sinal&gt;.</p>`,
      gmContext: `<p>Outro "texto", d'água &amp; &lt;sinal&gt;.</p>`,
      information: [{ id: "clue", content: `Texto "simples", d'água & <sinal>.`,
        availability: { mode: "situational" as const, condition: "Requer a chave." }, approaches: [
        { skill: "perception" as const, difficulty: 6, showDifficultyToPlayers: false },
      ] }] };
    const flag: PoiImportFlag = { importer: "pointOfInterest", adventureId: "playtest-alpha", documentId: preset.id,
      act: preset.act, version: 1, presetRevision: 3, state: "incomplete" };
    const placement: AdventureFolderPlacementFlag = { version: 1, adventureId: "playtest-alpha",
      documentType: "Item", documentId: preset.id, act: preset.act, folderId: "pointsOfInterest" };
    const port = createAdventurePoiItemPort();
    const id = await port.createItem(preset, "icons/svg/item-bag.svg", "poi-folder", flag, placement);
    const item = world[0];
    item.data.name = "Nome editado";
    item.data.img = "custom.png";
    item.data.folder = "manual-folder";
    item.data.ownership = { default: 2 };
    item.data.flags.ordemparanormal2.pointOfInterestVisibility = { mode: "users", users: ["player"] };
    // Knowledge of a situational information is ordinary knowledge and survives a managed update.
    item.data.flags.ordemparanormal2.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.agent", informationIds: ["clue"] }] };
    sanitizeHtmlOnUpdate = true;
    await expect(port.updateItem(id, poiSystem(preset), flag)).resolves.toBeUndefined();
    expect(port.listItems()[0].system).toEqual(poiSystem(preset));
    expect(item.toObject()).toMatchObject({ name: "Nome editado", img: "custom.png", folder: "manual-folder",
      ownership: { default: 2 }, flags: { ordemparanormal2: {
        pointOfInterestVisibility: { mode: "users", users: ["player"] },
        pointOfInterestKnowledge: { agents: [{ actorUuid: "Actor.agent", informationIds: ["clue"] }] },
      } } });
  });

  it("creates a GM-only world Item and restores only managed system fields", async () => {
    const preset = makePreset("actOne.map.01");
    const flag: PoiImportFlag = { importer: "pointOfInterest", adventureId: "playtest-alpha", documentId: preset.id,
      act: preset.act, version: 1, presetRevision: 1, state: "incomplete" };
    const placement: AdventureFolderPlacementFlag = { version: 1, adventureId: "playtest-alpha",
      documentType: "Item", documentId: preset.id, act: preset.act, folderId: "pointsOfInterest" };
    const port = createAdventurePoiItemPort();
    expect(() => port.validateCandidate(preset, flag)).not.toThrow();
    const id = await port.createItem(preset, "icons/svg/item-bag.svg", "poi-folder", flag, placement);
    expect(world[0].data.system).not.toHaveProperty("skills");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: "pointOfInterest",
      img: "icons/svg/item-bag.svg", folder: "poi-folder", ownership: { default: 0 } }));
    const item = world[0];
    item.data.name = "Nome editado";
    item.data.img = "custom.png";
    item.data.folder = "manual-folder";
    item.data.ownership = { default: 2 };
    item.data.flags.other = { key: "preserved" };
    item.data.flags.ordemparanormal2.pointOfInterestVisibility = { mode: "users", users: ["player"], notified: ["player"] };
    item.data.flags.ordemparanormal2.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.agent", informationIds: ["clue"] }] };
    item.data.system.gmContext = "Edição manual";
    await port.updateItem(id, poiSystem(preset), flag);
    expect(item.toObject()).toMatchObject({ name: "Nome editado", img: "custom.png", folder: "manual-folder",
      ownership: { default: 2 }, flags: { other: { key: "preserved" }, ordemparanormal2: {
        pointOfInterestVisibility: { mode: "users", users: ["player"], notified: ["player"] },
        pointOfInterestKnowledge: { agents: [{ actorUuid: "Actor.agent", informationIds: ["clue"] }] },
      } }, system: poiSystem(preset) });
    await port.completeItem(id, { ...flag, state: "complete", baseline: "digest" });
    expect(port.listItems()[0].flag).toMatchObject({ state: "complete", baseline: "digest" });
  });

  it("upgrades only the original fallback image", async () => {
    const preset = makePreset("actOne.map.11");
    const flag: PoiImportFlag = { importer: "pointOfInterest", adventureId: "playtest-alpha", documentId: preset.id,
      act: preset.act, version: 1, presetRevision: 1, state: "incomplete" };
    const placement: AdventureFolderPlacementFlag = { version: 1, adventureId: "playtest-alpha",
      documentType: "Item", documentId: preset.id, act: preset.act, folderId: "pointsOfInterest" };
    const port = createAdventurePoiItemPort();
    const id = await port.createItem(preset, "icons/svg/item-bag.svg", "poi-folder", flag, placement);
    expect(await port.updateImageIfFallback(id, "worlds/test/bookshelf.jpg")).toBe(true);
    expect(world[0].img).toBe("worlds/test/bookshelf.jpg");
    expect(await port.updateImageIfFallback(id, "worlds/test/other.jpg")).toBe(false);
    expect(world[0].img).toBe("worlds/test/bookshelf.jpg");
  });
});
