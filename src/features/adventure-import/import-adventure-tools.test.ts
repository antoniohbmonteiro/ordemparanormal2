import { describe, expect, it, vi } from "vitest";
import { AS09_IMAGES, AS09_TOOLS } from "../../config/adventure-definitions/playtest-alpha-as09";
import { importAdventureTools, type AdventureToolItemPort, type ToolImportFlag, type ToolItemSnapshot } from "./import-adventure-tools";
import { ensureAdventurePoiFolder, type AdventureFolderPort, type AdventureFolderSnapshot } from "./adventure-folders";

const materialization = { directory: "worlds/test/as09/v1", assets: AS09_IMAGES.map(image => ({ basename: image.basename,
  sourcePath: image.path, storedPath: `worlds/test/as09/v1/${image.outputBasename}` })) };
type MutableTool = { -readonly [Key in keyof ToolItemSnapshot]: ToolItemSnapshot[Key] };
class World implements AdventureToolItemPort, AdventureFolderPort {
  authorized = true;
  failCompletion = false;
  readonly items: Array<MutableTool & { folderId: string; name: string; system: { uses: number }; effects: string[] }> = [];
  readonly folders: AdventureFolderSnapshot[] = [];
  readonly prepareCanonical = vi.fn(async () => {});
  isAuthorized() { return this.authorized; }
  listItems() { return this.items; }
  listFolders() { return this.folders; }
  async createFolder(data: Parameters<AdventureFolderPort["createFolder"]>[0]) {
    const id = `folder-${this.folders.length}`;
    this.folders.push({ id, type: data.documentType, name: data.name, parentId: data.parentId, color: data.color, flag: data.flag }); return id;
  }
  async updateFolder(id: string, data: Parameters<AdventureFolderPort["updateFolder"]>[1]) {
    const i = this.folders.findIndex(folder => folder.id === id); this.folders[i] = { ...this.folders[i], ...data };
  }
  async createItem(flag: ToolImportFlag, img: string, folderId: string) {
    const id = `tool-${this.items.length}`;
    this.items.push({ id, type: "equipment", sourceUuid: flag.sourceUuid, img, flag,
      folderId, name: "Canonical", system: { uses: 3 }, effects: [] }); return id;
  }
  async updateImageIfFallback(id: string, img: string) {
    const item = this.items.find(item => item.id === id)!;
    if (item.img !== "icons/svg/item-bag.svg") return false;
    item.img = img; return true;
  }
  async completeItem(id: string, flag: ToolImportFlag) {
    if (this.failCompletion) { this.failCompletion = false; throw new Error("completion"); }
    this.items.find(item => item.id === id)!.flag = flag;
  }
}
const run = (world: World) => importAdventureTools({ acts: ["actTwo"], items: world, folders: world, materialization });
describe("Adventure World tools", () => {
  it("does no work when Act II is not selected, even with a complete supplemental package", async () => {
    const world = new World();
    expect(await importAdventureTools({ acts: ["actOne"], items: world, folders: world, materialization })).toEqual({ created: 0, updated: 0, unchanged: 0 });
    expect(world.prepareCanonical).not.toHaveBeenCalled();
    expect(world.items).toHaveLength(0); expect(world.folders).toHaveLength(0);
  });
  it("creates nine canonical tools alongside POIs and reuses them without adopting manual canonical copies", async () => {
    const world = new World(); const poi = await ensureAdventurePoiFolder({ adventureId: "playtest-alpha", act: "actTwo", folders: world });
    world.items.push({ id: "manual", type: "equipment", sourceUuid: AS09_TOOLS[0].sourceUuid, img: "manual.png", flag: null,
      folderId: "manual", name: "Canonical", system: { uses: 99 }, effects: [] });
    expect(await run(world)).toEqual({ created: 9, updated: 0, unchanged: 0 });
    const tools = world.folders.find(folder => folder.name === "Ferramentas")!;
    expect(tools.parentId).toBe(poi.actId);
    expect(world.items.slice(1).every(item => item.folderId === tools.id)).toBe(true);
    const ids = world.items.map(item => item.id);
    expect(await run(world)).toEqual({ created: 0, updated: 0, unchanged: 9 });
    expect(world.items.map(item => item.id)).toEqual(ids);
    expect(world.items[0].flag).toBeNull();
  });
  it("upgrades only fallback images and preserves every other edited field and folder move", async () => {
    const world = new World(); await run(world);
    world.items[0].img = "icons/svg/item-bag.svg";
    Object.assign(world.items[1], { img: "custom.png", name: "Renamed", folderId: "manual", system: { uses: 1 }, effects: ["manual"] });
    const before = structuredClone(world.items[1]);
    expect(await run(world)).toEqual({ created: 0, updated: 1, unchanged: 8 });
    expect(world.items[0].img).toContain("CÂMERA MODIFICADA.png");
    expect(world.items[1]).toEqual(before);
  });
  it("recovers a created but incomplete item after failure without recreating it", async () => {
    const world = new World(); world.failCompletion = true;
    await expect(run(world)).rejects.toMatchObject({ stage: "item", counts: { created: 0 } });
    expect(world.items).toHaveLength(1); const id = world.items[0].id;
    expect(await run(world)).toEqual({ created: 8, updated: 1, unchanged: 0 });
    expect(world.items[0].id).toBe(id);
  });
  it("preflights duplicate identity and canonical-source failures before creating anything", async () => {
    const world = new World(); await run(world);
    world.items.push({ ...world.items[0], id: "duplicate" });
    const count = world.items.length;
    await expect(run(world)).rejects.toMatchObject({ stage: "preflight" });
    expect(world.items).toHaveLength(count);
    const missing = new World(); missing.prepareCanonical.mockRejectedValueOnce(new Error("missing"));
    await expect(run(missing)).rejects.toMatchObject({ stage: "preflight" });
    expect(missing.items).toHaveLength(0); expect(missing.folders).toHaveLength(0);
  });
  it("checks authorization and cannot accept incomplete materialization", async () => {
    const world = new World(); world.authorized = false;
    await expect(run(world)).rejects.toMatchObject({ stage: "preflight" });
    world.authorized = true;
    await expect(importAdventureTools({ acts: ["actTwo"], items: world, folders: world, materialization: { ...materialization, assets: materialization.assets.slice(0, 17) } })).rejects.toMatchObject({ stage: "preflight" });
    expect(world.items).toHaveLength(0); expect(world.folders).toHaveLength(0);
  });
});
