import { describe, expect, it } from "vitest";
import { PLAYTEST_ALPHA_ADVENTURE } from "../../config/adventure-definitions/playtest-alpha";
import { PLAYTEST_ALPHA_POI_PRESETS } from "../../config/adventure-poi-presets/playtest-alpha";
import { validateAdventurePoiData, validateAdventurePoiReferences } from "../../core/adventure-import/adventure-poi-data";
import { importAdventurePois, type PoiImportFlag, type PoiItemPort, type PoiItemSnapshot } from "./import-adventure-pois";
import type { AdventureFolderPort, AdventureFolderSnapshot } from "./adventure-folders";

class FakeWorld implements PoiItemPort, AdventureFolderPort {
  readonly items: PoiItemSnapshot[] = [];
  readonly folders: AdventureFolderSnapshot[] = [];
  writes = 0;
  isAuthorized() { return true; }
  listItems() { return this.items; }
  listFolders() { return this.folders; }
  validateCandidate(_preset: typeof PLAYTEST_ALPHA_POI_PRESETS[number], _flag: PoiImportFlag) {}
  async createFolder(data: Parameters<AdventureFolderPort["createFolder"]>[0]) {
    const id = `folder-${this.folders.length + 1}`;
    this.folders.push({ id, name: data.name, color: data.color, type: data.documentType,
      parentId: data.parentId, flag: data.flag });
    this.writes++;
    return id;
  }
  async updateFolder(id: string, data: Parameters<AdventureFolderPort["updateFolder"]>[1]) {
    const index = this.folders.findIndex(folder => folder.id === id);
    this.folders[index] = { ...this.folders[index], ...data };
    this.writes++;
  }
  async createItem(preset: typeof PLAYTEST_ALPHA_POI_PRESETS[number], folderId: string,
    flag: PoiImportFlag, placement: Parameters<PoiItemPort["createItem"]>[3]) {
    const id = `item-${this.items.length + 1}`;
    this.items.push({ id, type: "pointOfInterest", folderId, flag, folderPlacement: placement,
      system: structuredClone({ publicDescription: preset.publicDescription, gmContext: preset.gmContext, skills: preset.skills }) });
    this.writes++;
    return id;
  }
  async updateFolderPlacement(id: string, folderId: string | null, flag: Parameters<PoiItemPort["updateFolderPlacement"]>[2]) {
    const index = this.items.findIndex(item => item.id === id);
    this.items[index] = { ...this.items[index], folderId, folderPlacement: flag };
    this.writes++;
  }
  async updateItem(id: string, system: Parameters<PoiItemPort["updateItem"]>[1], flag: PoiImportFlag) {
    const index = this.items.findIndex(item => item.id === id);
    this.items[index] = { ...this.items[index], system: structuredClone(system), flag };
    this.writes++;
  }
  async completeItem(id: string, flag: PoiImportFlag) {
    const index = this.items.findIndex(item => item.id === id);
    this.items[index] = { ...this.items[index], flag };
    this.writes++;
  }
}

function run(world: FakeWorld, acts: readonly ("actOne" | "actTwo")[],
  decide: Parameters<typeof importAdventurePois>[0]["decide"] = async () => "preserve",
  presets: readonly unknown[] = PLAYTEST_ALPHA_POI_PRESETS, revision = 1) {
  return importAdventurePois({ definition: PLAYTEST_ALPHA_ADVENTURE, presets, revision,
    acts, items: world, folders: world, decide });
}

describe("Adventure Point of Interest import", () => {
  it("validates the complete catalog, stable IDs and representative content boundaries", () => {
    expect(() => validateAdventurePoiReferences(PLAYTEST_ALPHA_ADVENTURE, PLAYTEST_ALPHA_POI_PRESETS)).not.toThrow();
    expect(PLAYTEST_ALPHA_POI_PRESETS.filter(p => p.act === "actOne")).toHaveLength(29);
    expect(PLAYTEST_ALPHA_POI_PRESETS.filter(p => p.act === "actTwo")).toHaveLength(25);
    expect(PLAYTEST_ALPHA_POI_PRESETS.find(p => p.id === "actOne.map.05")?.name).toContain("Rabiscos");
    expect(PLAYTEST_ALPHA_POI_PRESETS.find(p => p.id === "actOne.map.09")?.gmContext).toContain("05C");
    expect(PLAYTEST_ALPHA_POI_PRESETS.find(p => p.id === "actTwo.map.25")?.name).toBe("Freezer");
    expect(PLAYTEST_ALPHA_POI_PRESETS.find(p => p.id === "actTwo.map.21")?.skills).toEqual([]);
    const tattoo = PLAYTEST_ALPHA_POI_PRESETS.find(p => p.id === "actOne.character.tattoo")!;
    expect(tattoo.skills.find(group => group.skill === "medicine")?.information[0].id)
      .not.toBe(tattoo.skills.find(group => group.skill === "survival")?.information[0].id);
    expect(PLAYTEST_ALPHA_POI_PRESETS.every(p => p.skills.every(group => group.skill !== "aptitude"))).toBe(true);
  });

  it("imports only materialized Acts and remains unchanged on rerun", async () => {
    const one = new FakeWorld();
    expect(await run(one, ["actOne"])).toMatchObject({ created: 29, unchanged: 0 });
    expect(one.items).toHaveLength(29);
    expect(one.folders.map(folder => [folder.type, folder.name])).toEqual([
      ["Item", "A Maldição do Ídolo de Pedra"], ["Item", "Ato I"],
    ]);
    const writes = one.writes;
    expect(await run(one, ["actOne"])).toMatchObject({ created: 0, unchanged: 29 });
    expect(one.writes).toBe(writes);
    expect(await run(one, ["actTwo"])).toMatchObject({ created: 25 });
    expect(one.items).toHaveLength(54);
    expect(one.folders.map(folder => folder.name)).toEqual(["A Maldição do Ídolo de Pedra", "Ato I", "Ato II"]);
    const both = new FakeWorld();
    expect(await run(both, ["actOne", "actTwo"])).toMatchObject({ created: 54 });
    const two = new FakeWorld();
    expect(await run(two, ["actTwo"])).toMatchObject({ created: 25 });
    expect(two.items.every(item => (item.flag as PoiImportFlag).act === "actTwo")).toBe(true);
    expect(two.items.every(item => (item.flag as Record<string, unknown>).edition === undefined)).toBe(true);
  });

  it("preserves manual content or restores it by one batch decision and retains manual folder moves", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"]);
    const first = world.items[0];
    world.items[0] = { ...first, folderId: null, system: { ...first.system, gmContext: "Edição manual" } };
    const decisions: number[] = [];
    expect(await run(world, ["actOne"], async divergent => { decisions.push(divergent.length); return "preserve"; }))
      .toMatchObject({ preserved: 1, unchanged: 28 });
    expect(decisions).toEqual([1]);
    expect(world.items[0].system.gmContext).toBe("Edição manual");
    expect(world.items[0].folderId).toBeNull();
    expect(await run(world, ["actOne"], async () => "restore")).toMatchObject({ updated: 1, unchanged: 28 });
    expect(world.items[0].system.gmContext).toBe(PLAYTEST_ALPHA_POI_PRESETS[0].gmContext);
    expect(world.items[0].folderId).toBeNull();
  });

  it("applies a later preset revision without treating untouched content as a manual conflict", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"]);
    const revised = PLAYTEST_ALPHA_POI_PRESETS.map(p => p.id === "actOne.map.01"
      ? { ...p, gmContext: `${p.gmContext} Revisão editorial.` } : p);
    const decide = async () => { throw new Error("Não deveria solicitar decisão."); };
    expect(await run(world, ["actOne"], decide, revised, 2)).toMatchObject({ updated: 29, preserved: 0 });
    expect((world.items[0].flag as PoiImportFlag).presetRevision).toBe(2);
    expect(world.items.find(item => (item.flag as PoiImportFlag).documentId === "actOne.map.01")?.system.gmContext)
      .toContain("Revisão editorial.");
  });

  it("cancels a divergent batch before Item or Folder writes", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"]);
    world.items[0] = { ...world.items[0], system: { ...world.items[0].system, gmContext: "Alterado" } };
    const writes = world.writes;
    expect(await run(world, ["actOne"], async () => null)).toMatchObject({ cancelled: true });
    expect(world.writes).toBe(writes);
  });

  it("recovers an incomplete Item by its provenance after a partial failure", async () => {
    const world = new FakeWorld();
    const complete = world.completeItem.bind(world);
    let fail = true;
    world.completeItem = async (id, flag) => {
      if (fail) { fail = false; throw new Error("Falha simulada de baseline"); }
      return complete(id, flag);
    };
    await expect(run(world, ["actOne"])).rejects.toMatchObject({ stage: "baseline", counts: { created: 0 } });
    expect(world.items).toHaveLength(1);
    expect((world.items[0].flag as PoiImportFlag).state).toBe("incomplete");
    expect(await run(world, ["actOne"], async () => "restore")).toMatchObject({ created: 28, updated: 1 });
    expect(world.items).toHaveLength(29);
  });

  it("rejects invalid content before creating a Folder or Item", async () => {
    const world = new FakeWorld();
    const invalid = PLAYTEST_ALPHA_POI_PRESETS.map(p => p.id === "actTwo.map.25"
      ? { ...p, skills: [{ skill: "notRegistered", information: [{ id: "bad", difficulty: 6,
        content: "Pista", showDifficultyToPlayers: false }] }] } : p);
    expect(() => validateAdventurePoiData(invalid.at(-1))).toThrow();
    await expect(run(world, ["actOne"], undefined, invalid)).rejects.toMatchObject({ stage: "preflight" });
    expect(world.writes).toBe(0);
  });

  it("checks every preset against the native model before writing a selected Act", async () => {
    const world = new FakeWorld();
    world.validateCandidate = preset => {
      if (preset.id === "actTwo.map.25") throw new Error("Modelo inválido");
    };
    await expect(run(world, ["actOne"])).rejects.toMatchObject({ stage: "preflight", message: "Modelo inválido" });
    expect(world.writes).toBe(0);
  });

  it("stops duplicate provenance without adopting same-name manual Items", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"]);
    world.items.push({ ...world.items[0], id: "duplicate" });
    await expect(run(world, ["actOne"])).rejects.toMatchObject({ stage: "preflight" });
    world.items.pop();
    world.items.push({ id: "manual", type: "pointOfInterest", folderId: null, flag: null,
      folderPlacement: null, system: { publicDescription: "", gmContext: "", skills: [] } });
    expect(await run(world, ["actOne"])).toMatchObject({ unchanged: 29 });
    expect(world.items).toHaveLength(30);
  });
});
