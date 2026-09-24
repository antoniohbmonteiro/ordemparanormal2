import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYTEST_ALPHA_POI_PRESETS } from "../../config/adventure-poi-presets/playtest-alpha";
import { poiSystem } from "../../core/adventure-import/adventure-poi-data";
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
  }
}

beforeEach(() => {
  world.length = 0;
  create.mockClear();
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } });
  vi.stubGlobal("game", { user: { isGM: true, id: "gm" }, users: { activeGM: { id: "gm" } },
    items: { contents: world, get: (id: string) => world.find(item => item.id === id) } });
  vi.stubGlobal("foundry", { documents: { Item: NativeItem }, data: { operators: { ForcedReplacement: Replacement } } });
});

afterEach(() => vi.unstubAllGlobals());

describe("Foundry Adventure POI Item adapter", () => {
  it("creates a GM-only world Item and restores only managed system fields", async () => {
    const preset = PLAYTEST_ALPHA_POI_PRESETS[0];
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
    const preset = PLAYTEST_ALPHA_POI_PRESETS.find(p => p.id === "actOne.map.11")!;
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
