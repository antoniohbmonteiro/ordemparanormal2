import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdventureToolItemPort } from "./adventure-tool-items";
import type { ToolImportFlag } from "../../features/adventure-import/import-adventure-tools";

interface ItemData {
  _id?: string; name: string; type: string; img: string; folder?: string;
  _stats?: { compendiumSource?: string };
  system: { uses: { value: number; max: number }; description: string };
  flags?: Record<string, Record<string, unknown>>;
}
const uuid = "Compendium.ordemparanormal2.equipment.Item.equipment0000002";
const world: FakeItem[] = [];
const writes = vi.fn();
class FakeItem {
  static implementation = FakeItem;
  static async create(data: ItemData) { const item = new FakeItem({ ...structuredClone(data), _id: `world-${world.length}` }); world.push(item); return item; }
  constructor(readonly data: ItemData) {}
  get id() { return this.data._id; }
  get type() { return this.data.type; }
  get documentName() { return "Item"; }
  get uuid() { return this.id === "equipment0000002" ? uuid : `Item.${this.id}`; }
  get img() { return this.data.img; }
  get _stats() { return this.data._stats; }
  get isEmbedded() { return false; }
  get inCompendium() { return this.id === "equipment0000002"; }
  get folder() { return this.data.folder ? { id: this.data.folder } : null; }
  validate() { return true; }
  getFlag(scope: string, key: string) { return this.data.flags?.[scope]?.[key]; }
  async update(update: Record<string, unknown>) {
    writes(update);
    if ("img" in update) this.data.img = update.img as string;
    if ("flags.ordemparanormal2.adventureImport" in update) this.data.flags!.ordemparanormal2.adventureImport = update["flags.ordemparanormal2.adventureImport"];
  }
}
const sourceData: ItemData = { _id: "equipment0000002", name: "Canonical Camera", type: "equipment", img: "icons/svg/item-bag.svg",
  system: { uses: { value: 3, max: 3 }, description: "Canonical" }, flags: { other: { keep: true } } };
const source = new FakeItem(structuredClone(sourceData));
const pack = { documentName: "Item", getIndex: vi.fn(async () => [{ _id: source.id, uuid, type: "equipment" }]),
  getDocument: vi.fn(async () => source) };
const fromCompendium = vi.fn((item: FakeItem) => {
  const { _id: _id, ...data } = structuredClone(item.data); return { ...data, _stats: { compendiumSource: item.uuid } };
});
const flag: ToolImportFlag = { importer: "equipment", version: 1, adventureId: "playtest-alpha", act: "actTwo",
  documentId: "actTwo.tool.equipment0000002", sourceUuid: uuid, state: "incomplete" };
beforeEach(() => {
  world.length = 0; writes.mockClear(); fromCompendium.mockClear(); pack.getIndex.mockClear(); pack.getDocument.mockClear();
  vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    packs: { get: () => pack }, items: { contents: world, get: (id: string) => world.find(item => item.id === id), fromCompendium } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } });
  vi.stubGlobal("foundry", { documents: { Item: FakeItem }, utils: { mergeObject: (left: object, right: object) => ({ ...left, ...right }) } });
});
afterEach(() => vi.unstubAllGlobals());
describe("Foundry Adventure tool adapter", () => {
  it("uses the index UUID and native import transform, preserving canonical metadata without writing the source", async () => {
    const port = createAdventureToolItemPort();
    await port.prepareCanonical(uuid, "equipment0000002", "worlds/test/camera.png");
    const id = await port.createItem(flag, "worlds/test/camera.png", "tools", { version: 1, adventureId: "playtest-alpha",
      documentType: "Item", documentId: flag.documentId, act: "actTwo", folderId: "tools" });
    expect(fromCompendium).toHaveBeenCalledWith(source, { keepId: false, clearFolder: true, clearOwnership: true });
    expect(port.listItems()).toMatchObject([{ id, sourceUuid: uuid, img: "worlds/test/camera.png", flag }]);
    expect(world[0].data.flags?.other.keep).toBe(true);
    expect(source.data).toEqual(sourceData); expect(writes).not.toHaveBeenCalled();
  });
  it("updates only fallback images and the managed completion flag", async () => {
    const port = createAdventureToolItemPort(); await port.prepareCanonical(uuid, "equipment0000002", "worlds/test/camera.png");
    const id = await port.createItem(flag, "worlds/test/camera.png", "tools", { version: 1, adventureId: "playtest-alpha", documentType: "Item", documentId: flag.documentId, act: "actTwo", folderId: "tools" });
    world[0].data.name = "Edited"; world[0].data.system.uses.value = 1; world[0].data.img = "custom.png";
    expect(await port.updateImageIfFallback(id, "worlds/test/new.png")).toBe(false);
    world[0].data.img = "icons/svg/item-bag.svg";
    expect(await port.updateImageIfFallback(id, "worlds/test/new.png")).toBe(true);
    await port.completeItem(id, { ...flag, state: "complete" });
    expect(writes.mock.calls.map(([data]) => Object.keys(data))).toEqual([["img"], ["flags.ordemparanormal2.adventureImport"]]);
    expect(world[0].data).toMatchObject({ name: "Edited", system: { uses: { value: 1 } } });
  });
  it("rejects an index/source mismatch and inactive GM before creation", async () => {
    const port = createAdventureToolItemPort();
    await expect(port.prepareCanonical(uuid.replace("0000002", "0000003"), "equipment0000002", "img.png")).rejects.toThrow("canônica");
    vi.stubGlobal("game", { user: { id: "other", isGM: true }, users: { activeGM: { id: "gm" } }, items: { contents: world } });
    await expect(createAdventureToolItemPort().prepareCanonical(uuid, "equipment0000002", "img.png")).rejects.toThrow("GM ativo");
    expect(world).toHaveLength(0);
  });
});
