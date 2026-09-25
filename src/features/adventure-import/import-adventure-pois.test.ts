import { describe, expect, it, vi } from "vitest";
import { PLAYTEST_ALPHA_ADVENTURE } from "../../config/adventure-definitions/playtest-alpha";
import { PLAYTEST_ALPHA_POI_SOURCES } from "../../config/adventure-poi-sources/playtest-alpha";
import { validateAdventurePoiData, validateAdventurePoiReferences, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";
import { managedDigest } from "../../core/adventure-import/adventure-agent-reconciliation";
import { importAdventurePois, managedPoiDigest, type PoiImportFlag, type PoiItemPort, type PoiItemSnapshot } from "./import-adventure-pois";
import type { AdventureFolderPort, AdventureFolderSnapshot } from "./adventure-folders";
import type { AdventureAssetResolutionSource } from "./resolve-adventure-asset";
import type { MaterializationResult } from "./materialize-adventure-assets";

const SYNTHETIC_POI_PRESETS: readonly AdventurePoiPreset[] = PLAYTEST_ALPHA_POI_SOURCES.map(source => ({
  id: source.id, act: source.act, name: source.heading,
  ...(source.imageAssetId ? { imageAssetId: source.imageAssetId } : {}),
  publicDescription: `<p>Synthetic ${source.id}</p>`, gmContext: `Synthetic GM ${source.id}`,
  information: [
    ...source.informationIds.map(id => ({ id, content: `Synthetic ${id}`,
      availability: { mode: "always" as const, condition: "" as const },
      approaches: id === "scarAgeMedicine" ? [
        { skill: "medicine" as const, difficulty: 6, showDifficultyToPlayers: false },
        { skill: "survival" as const, difficulty: 6, showDifficultyToPlayers: false },
      ] : id === "expeditionNotes" ? [{ skill: "research" as const, difficulty: 6, showDifficultyToPlayers: false,
        difficultyOverride: { difficulty: 10, condition: "Synthetic override condition" } }]
        : [{ skill: "perception" as const, difficulty: 6, showDifficultyToPlayers: false }] })),
    ...(source.situationalInformation ?? []).map(({ id }) => ({ id, content: `Synthetic ${id}`,
      availability: { mode: "situational" as const, condition: `Synthetic condition ${id}` },
      approaches: [{ skill: "intuition" as const, difficulty: 6, showDifficultyToPlayers: false }] })),
  ],
}));
/** The persisted shape of an Item imported before information availability existed. */
function withoutAvailability(system: PoiItemSnapshot["system"]): PoiItemSnapshot["system"] {
  return { ...system, information: system.information.map(({ availability: _availability, ...entry }) => entry) } as never;
}

class FakeWorld implements PoiItemPort, AdventureFolderPort {
  readonly items: PoiItemSnapshot[] = [];
  readonly folders: AdventureFolderSnapshot[] = [];
  writes = 0;
  sanitizeHtml = false;
  persistSystem(system: Parameters<PoiItemPort["updateItem"]>[1]) {
    const copy = structuredClone(system);
    if (!this.sanitizeHtml) return copy;
    return { ...copy,
      publicDescription: copy.publicDescription.replace(/&quot;/gu, '"').replace(/&#39;/gu, "'"),
      gmContext: copy.gmContext.replace(/&quot;/gu, '"').replace(/&#39;/gu, "'"),
    };
  }
  readonly lookup = { worldId: "test-world",
    findExisting: vi.fn(async (_directory: string, basename: string) => `worlds/test-world/${basename}`) };
  isAuthorized() { return true; }
  listItems() { return this.items; }
  listFolders() { return this.folders; }
  validateCandidate(_preset: typeof SYNTHETIC_POI_PRESETS[number], _flag: PoiImportFlag) {}
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
  async createItem(preset: typeof SYNTHETIC_POI_PRESETS[number], img: string, folderId: string,
    flag: PoiImportFlag, placement: Parameters<PoiItemPort["createItem"]>[4]) {
    const id = `item-${this.items.length + 1}`;
    this.items.push({ id, type: "pointOfInterest", folderId, img, flag, folderPlacement: placement,
      system: this.persistSystem({ publicDescription: preset.publicDescription, gmContext: preset.gmContext, information: preset.information }) });
    this.writes++;
    return id;
  }
  async updateFolderPlacement(id: string, folderId: string | null, flag: Parameters<PoiItemPort["updateFolderPlacement"]>[2]) {
    const index = this.items.findIndex(item => item.id === id);
    this.items[index] = { ...this.items[index], folderId, folderPlacement: flag };
    this.writes++;
  }
  async updateImageIfFallback(id: string, img: string) {
    const index = this.items.findIndex(item => item.id === id);
    if (this.items[index].img !== "icons/svg/item-bag.svg") return false;
    this.items[index] = { ...this.items[index], img };
    this.writes++;
    return true;
  }
  async updateItem(id: string, system: Parameters<PoiItemPort["updateItem"]>[1], flag: PoiImportFlag) {
    const index = this.items.findIndex(item => item.id === id);
    this.items[index] = { ...this.items[index], system: this.persistSystem(system), flag };
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
  presets: readonly unknown[] = SYNTHETIC_POI_PRESETS, revision = 3,
  assetSource: AdventureAssetResolutionSource = { kind: "worldStorage", lookup: world.lookup }) {
  return importAdventurePois({ definition: PLAYTEST_ALPHA_ADVENTURE, presets, revision,
    acts, items: world, folders: world, assetSource, decide });
}

describe("Adventure Point of Interest import", () => {
  it.each(["relative", "hosted"])("uses %s materialized POI images and reimports without browsing", async representation => {
    const world = new FakeWorld();
    const imagePresets = SYNTHETIC_POI_PRESETS.filter(p => p.imageAssetId);
    const paths = new Map(imagePresets.map(p => [p.id,
      `${representation === "hosted" ? "https://assets.example.test/prefix/" : ""}worlds/test-world/${encodeURIComponent(p.imageAssetId!)}.jpg`]));
    const result: MaterializationResult = { materializedActs: ["actOne"], assets: imagePresets.map(p => {
      const reference = PLAYTEST_ALPHA_ADVENTURE.assets.find(a => a.id === p.imageAssetId)!;
      return { act: reference.source.act, originalEntryPath: reference.source.originalEntryPath,
        storedPath: paths.get(p.id)! };
    }) };
    const source = { kind: "materialization" as const, result };
    expect(await run(world, ["actOne"], undefined, undefined, undefined, source)).toMatchObject({ created: 29 });
    for (const preset of imagePresets) {
      const item = world.items.find(candidate => (candidate.flag as PoiImportFlag).documentId === preset.id)!;
      expect(item.img).toBe(paths.get(preset.id));
    }
    const writes = world.writes;
    expect(await run(world, ["actOne"], undefined, undefined, undefined, source)).toMatchObject({ unchanged: 29 });
    expect(world.writes).toBe(writes);
    expect(world.lookup.findExisting).not.toHaveBeenCalled();
  });

  it("fails before POI writes when a materialized image is missing", async () => {
    const world = new FakeWorld();
    const source = { kind: "materialization" as const,
      result: { materializedActs: ["actOne" as const], assets: [] } };
    await expect(run(world, ["actOne"], undefined, undefined, undefined, source))
      .rejects.toMatchObject({ stage: "preflight" });
    expect(world.writes).toBe(0);
    expect(world.lookup.findExisting).not.toHaveBeenCalled();
  });

  it("validates the complete catalog, stable IDs and representative content boundaries", () => {
    expect(() => validateAdventurePoiReferences(PLAYTEST_ALPHA_ADVENTURE, SYNTHETIC_POI_PRESETS)).not.toThrow();
    expect(SYNTHETIC_POI_PRESETS.filter(p => p.act === "actOne")).toHaveLength(29);
    expect(SYNTHETIC_POI_PRESETS.filter(p => p.act === "actTwo")).toHaveLength(25);
    expect(SYNTHETIC_POI_PRESETS.find(p => p.id === "actOne.map.05")?.name).toContain("Rabiscos");
    expect(SYNTHETIC_POI_PRESETS.find(p => p.id === "actOne.map.09")?.gmContext).toContain("Synthetic GM");
    expect(SYNTHETIC_POI_PRESETS.find(p => p.id === "actTwo.map.25")?.name).toBe("Freezer");
    expect(SYNTHETIC_POI_PRESETS.find(p => p.id === "actTwo.map.21")?.information).toEqual([]);
    const tattoo = SYNTHETIC_POI_PRESETS.find(p => p.id === "actOne.character.tattoo")!;
    expect(tattoo.information.find(entry => entry.id === "scarAgeMedicine")?.approaches.map(approach => approach.skill))
      .toEqual(["medicine", "survival"]);
    expect(SYNTHETIC_POI_PRESETS.every(p => p.information.every(entry => entry.approaches.every(approach => approach.showDifficultyToPlayers === false)))).toBe(true);
    expect(SYNTHETIC_POI_PRESETS.filter(p => p.imageAssetId).map(p => [p.id, p.imageAssetId])).toEqual([
      ["actOne.map.11", "actOne.handout.06"], ["actOne.map.12", "actOne.handout.07"],
      ["actOne.map.13", "actOne.handout.08"], ["actOne.map.14", "actOne.handout.09"],
      ["actOne.map.15", "actOne.handout.10"],
    ]);
  });

  it("rejects absent, cross-Act and non-image assets in preset preflight", async () => {
    const preset = SYNTHETIC_POI_PRESETS.find(p => p.id === "actOne.map.11")!;
    for (const imageAssetId of ["missing", "actTwo.handout.03", "actTwo.handout.01.print"]) {
      const invalid = SYNTHETIC_POI_PRESETS.map(p => p.id === preset.id ? { ...p, imageAssetId } : p);
      const world = new FakeWorld();
      await expect(run(world, ["actOne"], undefined, invalid)).rejects.toMatchObject({ stage: "preflight" });
      expect(world.writes).toBe(0);
    }
    expect(() => validateAdventurePoiData({ ...preset, imageAssetId: "" })).toThrow();
    const invalidDefinition = { ...PLAYTEST_ALPHA_ADVENTURE,
      assets: PLAYTEST_ALPHA_ADVENTURE.assets.map(asset => asset.id === preset.imageAssetId
        ? { ...asset, source: { ...asset.source, originalEntryPath: "Handouts/book.pdf" } } : asset) };
    expect(() => validateAdventurePoiReferences(invalidDefinition, SYNTHETIC_POI_PRESETS)).toThrow("Imagem de POI inválida");
  });

  it("resolves five Act I images from world storage before creating their Items", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"]);
    expect(world.lookup.findExisting).toHaveBeenCalledTimes(5);
    expect(world.lookup.findExisting).toHaveBeenCalledWith(
      expect.stringContaining("/act-1/Arquivos para o público - Ato I/Handouts"),
      "Handout 06 - Estante de Livros.jpg",
    );
    for (const preset of SYNTHETIC_POI_PRESETS.filter(p => p.imageAssetId)) {
      const item = world.items.find(candidate => (candidate.flag as PoiImportFlag).documentId === preset.id)!;
      expect(item.img).toContain(".jpg");
      expect(item.folderId).toBe("folder-3");
    }
    expect(world.items.find(item => (item.flag as PoiImportFlag).documentId === "actOne.map.10")?.img)
      .toBe("icons/svg/item-bag.svg");
    const two = new FakeWorld();
    await run(two, ["actTwo"]);
    expect(two.lookup.findExisting).not.toHaveBeenCalled();
  });

  it("blocks all POI writes when a referenced image is absent from world storage", async () => {
    const world = new FakeWorld();
    world.lookup.findExisting.mockResolvedValueOnce(null as never);
    await expect(run(world, ["actOne"])).rejects.toMatchObject({ stage: "preflight" });
    expect(world.writes).toBe(0);
  });

  it("imports only materialized Acts and remains unchanged on rerun", async () => {
    const one = new FakeWorld();
    expect(await run(one, ["actOne"])).toMatchObject({ created: 29, unchanged: 0 });
    expect(one.items).toHaveLength(29);
    expect(one.folders.map(folder => [folder.type, folder.name])).toEqual([
      ["Item", "A Maldição do Ídolo de Pedra"], ["Item", "Ato I"], ["Item", "Pontos de Interesse"],
    ]);
    expect(one.items.every(item => item.folderId === "folder-3")).toBe(true);
    const writes = one.writes;
    expect(await run(one, ["actOne"])).toMatchObject({ created: 0, unchanged: 29 });
    expect(one.writes).toBe(writes);
    expect(await run(one, ["actTwo"])).toMatchObject({ created: 25 });
    expect(one.items).toHaveLength(54);
    expect(one.folders.map(folder => folder.name)).toEqual([
      "A Maldição do Ídolo de Pedra", "Ato I", "Pontos de Interesse", "Ato II", "Pontos de Interesse",
    ]);
    expect(one.folders[4].parentId).toBe("folder-4");
    const both = new FakeWorld();
    expect(await run(both, ["actOne", "actTwo"])).toMatchObject({ created: 54 });
    const two = new FakeWorld();
    expect(await run(two, ["actTwo"])).toMatchObject({ created: 25 });
    expect(two.items.every(item => (item.flag as PoiImportFlag).act === "actTwo")).toBe(true);
    expect(two.items.every(item => (item.flag as Record<string, unknown>).edition === undefined)).toBe(true);
  });

  it("uses the same canonical HTML for persistence, baseline and an unchanged second import", async () => {
    const world = new FakeWorld();
    world.sanitizeHtml = true;
    const presets = SYNTHETIC_POI_PRESETS.map(preset => preset.id === "actOne.map.09" ? {
      ...preset,
      publicDescription: `<p>Um "texto", d'água &amp; &lt;sinal&gt;.</p>`,
      gmContext: `<p>Outro "texto", d'água &amp; &lt;sinal&gt;.</p>`,
      information: preset.information.map(entry => ({ ...entry,
        content: `Texto simples "citado", d'água & <sinal>.` })),
    } : preset);
    expect(await run(world, ["actOne"], undefined, presets)).toMatchObject({ created: 29 });
    const item = world.items.find(candidate => (candidate.flag as PoiImportFlag).documentId === "actOne.map.09")!;
    expect((item.flag as PoiImportFlag).baseline).toBe(await managedPoiDigest(item.system));
    expect(item.system.publicDescription).toBe(presets.find(preset => preset.id === "actOne.map.09")!.publicDescription);
    const writes = world.writes;
    expect(await run(world, ["actOne"], undefined, presets)).toMatchObject({ unchanged: 29, updated: 0, preserved: 0 });
    expect(world.writes).toBe(writes);
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
    expect(world.items[0].system.gmContext).toBe(SYNTHETIC_POI_PRESETS[0].gmContext);
    expect(world.items[0].folderId).toBeNull();
  });

  it("moves old placed POIs once and preserves manual moves before and after the upgrade", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"]);
    const oldMarker = (index: number) => {
      const placement = world.items[index].folderPlacement as Record<string, unknown>;
      world.items[index] = { ...world.items[index], folderPlacement: Object.fromEntries(
        Object.entries(placement).filter(([key]) => key !== "folderId")) };
    };
    oldMarker(0); oldMarker(1);
    world.items[0] = { ...world.items[0], folderId: "folder-2" };
    world.items[1] = { ...world.items[1], folderId: "manual-folder" };
    world.items[2] = { ...world.items[2], folderId: "folder-2" };
    expect(await run(world, ["actOne"])).toMatchObject({ unchanged: 29 });
    expect(world.items[0].folderId).toBe("folder-3");
    expect(world.items[1].folderId).toBe("manual-folder");
    expect(world.items[2].folderId).toBe("folder-2");
    expect(world.items.slice(0, 3).every(item => (item.folderPlacement as Record<string, unknown>).folderId === "pointsOfInterest")).toBe(true);
    world.items[0] = { ...world.items[0], folderId: "folder-2" };
    const writes = world.writes;
    expect(await run(world, ["actOne"])).toMatchObject({ unchanged: 29 });
    expect(world.items[0].folderId).toBe("folder-2");
    expect(world.writes).toBe(writes);
  });

  it("upgrades only an old fallback image and keeps a GM-selected image on rerun", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"]);
    const bookshelf = world.items.findIndex(item => (item.flag as PoiImportFlag).documentId === "actOne.map.11");
    const poster = world.items.findIndex(item => (item.flag as PoiImportFlag).documentId === "actOne.map.12");
    world.items[bookshelf] = { ...world.items[bookshelf], img: "icons/svg/item-bag.svg" };
    world.items[poster] = { ...world.items[poster], img: "worlds/test/custom-poster.png" };
    expect(await run(world, ["actOne"])).toMatchObject({ updated: 1, unchanged: 28 });
    expect(world.items[bookshelf].img).toContain("Handout 06 - Estante de Livros.jpg");
    expect(world.items[poster].img).toBe("worlds/test/custom-poster.png");
    const writes = world.writes;
    expect(await run(world, ["actOne"])).toMatchObject({ updated: 0, unchanged: 29 });
    expect(world.writes).toBe(writes);
  });

  it("applies a later preset revision without treating untouched content as a manual conflict", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"]);
    const revised = SYNTHETIC_POI_PRESETS.map(p => p.id === "actOne.map.01"
      ? { ...p, gmContext: `${p.gmContext} Revisão editorial.` } : p);
    const decide = async () => { throw new Error("Não deveria solicitar decisão."); };
    expect(await run(world, ["actOne"], decide, revised, 4)).toMatchObject({ updated: 29, preserved: 0 });
    expect((world.items[0].flag as PoiImportFlag).presetRevision).toBe(4);
    expect(world.items.find(item => (item.flag as PoiImportFlag).documentId === "actOne.map.01")?.system.gmContext)
      .toContain("Revisão editorial.");
  });

  it("persists situational information and keeps a second identical import unchanged", async () => {
    const world = new FakeWorld();
    expect(await run(world, ["actOne", "actTwo"], undefined, undefined, 4)).toMatchObject({ created: 54 });
    const freezer = world.items.find(item => (item.flag as PoiImportFlag).documentId === "actOne.map.24")!;
    expect(freezer.system.information).toHaveLength(9);
    expect(freezer.system.information.every(entry => entry.availability.mode === "situational")).toBe(true);
    const writes = world.writes;
    const decide = async () => { throw new Error("Não deveria solicitar decisão."); };
    expect(await run(world, ["actOne", "actTwo"], decide, undefined, 4))
      .toMatchObject({ created: 0, updated: 0, unchanged: 54, preserved: 0 });
    expect(world.writes).toBe(writes);
  });

  it("upgrades Items imported before availability existed without reporting them as manual edits", async () => {
    const world = new FakeWorld();
    const revisionThree = SYNTHETIC_POI_PRESETS.map(preset => ({ ...preset,
      information: preset.information.filter(entry => entry.availability.mode === "always") }));
    await run(world, ["actOne"], undefined, revisionThree, 3);
    // Revision 3 baselines digested information without availability; the model now reads "always" for it.
    for (const [index, item] of world.items.entries()) {
      world.items[index] = { ...item, flag: { ...(item.flag as PoiImportFlag),
        baseline: await managedDigest(withoutAvailability(item.system)) } };
    }
    world.items[1] = { ...world.items[1], system: withoutAvailability(world.items[1].system) };
    const decide = async () => { throw new Error("Não deveria solicitar decisão."); };
    expect(await run(world, ["actOne"], decide, undefined, 4)).toMatchObject({ updated: 29, preserved: 0 });
    const freezer = world.items.find(item => (item.flag as PoiImportFlag).documentId === "actOne.map.24")!;
    expect(freezer.system.information.map(entry => entry.id)).toEqual(
      PLAYTEST_ALPHA_POI_SOURCES.find(source => source.id === "actOne.map.24")!.situationalInformation!.map(binding => binding.id));
    expect((freezer.flag as PoiImportFlag).presetRevision).toBe(4);
    expect(await run(world, ["actOne"], decide, undefined, 4)).toMatchObject({ unchanged: 29 });
  });

  it("keeps an alternative DT stable on reimport and upgrades Items stored without it without false conflicts", async () => {
    const world = new FakeWorld();
    const revisionFour = SYNTHETIC_POI_PRESETS.map(preset => ({ ...preset, information: preset.information.map(entry => ({
      ...entry, approaches: entry.approaches.map(({ difficultyOverride: _override, ...approach }) => approach) })) }));
    await run(world, ["actOne"], undefined, revisionFour, 4);
    // Read through the model, an approach stored without an alternative DT carries it as an undefined key.
    for (const [index, item] of world.items.entries()) {
      world.items[index] = { ...item, system: { ...item.system, information: item.system.information.map(entry => ({
        ...entry, approaches: entry.approaches.map(approach => ({ ...approach, difficultyOverride: undefined })) })) } };
    }
    const decide = async () => { throw new Error("Não deveria solicitar decisão."); };
    expect(await run(world, ["actOne"], decide, undefined, 5)).toMatchObject({ updated: 29, preserved: 0 });
    const cabinet = world.items.find(item => (item.flag as PoiImportFlag).documentId === "actOne.map.08")!;
    expect(cabinet.system.information.find(entry => entry.id === "expeditionNotes")?.approaches).toEqual([{
      skill: "research", difficulty: 6, showDifficultyToPlayers: false,
      difficultyOverride: { difficulty: 10, condition: "Synthetic override condition" } }]);
    const writes = world.writes;
    expect(await run(world, ["actOne"], decide, undefined, 5)).toMatchObject({ unchanged: 29, updated: 0 });
    expect(world.writes).toBe(writes);
  });

  it("treats a manual availability change as a divergence to preserve or restore", async () => {
    const world = new FakeWorld();
    await run(world, ["actOne"], undefined, undefined, 4);
    const index = world.items.findIndex(item => (item.flag as PoiImportFlag).documentId === "actOne.map.24");
    const manual = world.items[index].system.information.map((entry, position) => position === 0
      ? { ...entry, availability: { mode: "always" as const, condition: "" as const } } : entry);
    world.items[index] = { ...world.items[index], system: { ...world.items[index].system, information: manual } };
    const decisions: number[] = [];
    expect(await run(world, ["actOne"], async divergent => { decisions.push(divergent.length); return "preserve"; }, undefined, 4))
      .toMatchObject({ preserved: 1, unchanged: 28 });
    expect(decisions).toEqual([1]);
    expect(world.items[index].system.information[0].availability.mode).toBe("always");
    expect(await run(world, ["actOne"], async () => "restore", undefined, 4)).toMatchObject({ updated: 1 });
    expect(world.items[index].system.information[0].availability.mode).toBe("situational");
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
    const invalid = SYNTHETIC_POI_PRESETS.map(p => p.id === "actTwo.map.25"
      ? { ...p, information: [{ id: "bad", content: "Pista", approaches: [
        { skill: "notRegistered", difficulty: 6, showDifficultyToPlayers: false }] }] } : p);
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
    world.items.push({ id: "manual", type: "pointOfInterest", folderId: null, img: "custom.png", flag: null,
      folderPlacement: null, system: { publicDescription: "", gmContext: "", information: [] } });
    expect(await run(world, ["actOne"])).toMatchObject({ unchanged: 29 });
    expect(world.items).toHaveLength(30);
  });
});
