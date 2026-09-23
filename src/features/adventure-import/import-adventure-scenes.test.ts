import { describe, expect, it, vi } from "vitest";
import { importFlag } from "../../core/adventure-import/adventure-agent-reconciliation";
import { SCENE_COLLECTIONS, type AdventureSceneSource } from "../../core/adventure-import/adventure-scene-reconciliation";
import { importAdventureScenes, SceneImportError } from "./import-adventure-scenes";
import { sceneImportFixture } from "./adventure-scene-test-fixtures";

describe("Scene import workflow", () => {
  it.each(["relative", "hosted"])("uses %s materialized backgrounds, Tiles, and Tokens and the packaged control Tile directly", async representation => {
    const f = sceneImportFixture();
    const preset = f.input.presets[0];
    const adventureTile = preset.tiles[0];
    const modifiedPreset = { ...preset, tiles: preset.tiles.map(tile => tile.id === adventureTile.id
      ? { ...tile, textureAsset: { kind: "adventure" as const, assetId: preset.level.backgroundAssetId } } : tile) };
    const input = { ...f.input, presets: [modifiedPreset, ...f.input.presets.slice(1)] };
    for (const asset of f.input.materialization.assets) {
      if (representation === "hosted") asset.storedPath = `https://assets.example.test/prefix/${asset.storedPath}`;
    }
    const storedPath = (id: string) => {
      const reference = f.input.definition.assets.find(asset => asset.id === id)!;
      return f.input.materialization.assets.find(asset => asset.act === reference.source.act
        && asset.originalEntryPath === reference.source.originalEntryPath)!.storedPath;
    };

    expect(await importAdventureScenes(input)).toMatchObject({ created: 1 });
    const scene = f.world[0];
    expect((scene.levels[0].background as { src: string }).src).toBe(storedPath(preset.level.backgroundAssetId));
    expect((scene.tiles.find(tile => tile._id === adventureTile.id)!.texture as { src: string }).src)
      .toBe(storedPath(preset.level.backgroundAssetId));
    for (const token of scene.tokens) {
      const actor = f.actors.find(candidate => candidate._id === token.actorId)!;
      const tokenAssetId = importFlag(actor)!.tokenAssetId as string;
      expect((token.texture as { src: string }).src).toBe(storedPath(tokenAssetId));
    }
    const systemTiles = modifiedPreset.tiles.filter(tile => tile.textureAsset.kind === "system");
    expect(systemTiles.length).toBeGreaterThan(0);
    for (const { id } of systemTiles) {
      expect((scene.tiles.find(tile => tile._id === id)!.texture as { src: string }).src)
        .toBe("systems/ordemparanormal2/assets/scene-controls/gm-control-button.png");
    }
    expect(f.port).not.toHaveProperty("confirmAsset");
  });

  it("fails on a missing materialized background before Scene writes", async () => {
    const f = sceneImportFixture();
    const backgroundId = f.input.presets[0].level.backgroundAssetId;
    const reference = f.input.definition.assets.find(asset => asset.id === backgroundId)!;
    f.input.materialization.assets = f.input.materialization.assets.filter(asset =>
      asset.originalEntryPath !== reference.source.originalEntryPath || asset.act !== reference.source.act);
    await expect(importAdventureScenes(f.input)).rejects.toMatchObject({ stage: "preflight" });
    f.writes().forEach(write => expect(write).not.toHaveBeenCalled());
  });

  it("creates the reviewed Scene with semantic Actor bindings and is a write-free rerun", async () => {
    const f = sceneImportFixture();
    expect(await importAdventureScenes(f.input)).toMatchObject({ created: 1 });
    const s = f.world[0];
    expect(s.levels).toHaveLength(1); expect(s.walls).toHaveLength(168); expect(s.tiles).toHaveLength(3); expect(s.tokens).toHaveLength(5); expect(s.drawings).toHaveLength(3);
    expect(s.levels[0].background).toMatchObject({ src: "worlds/test/actOne.basement.completeMap.png" });
    for (const t of s.tokens) expect(f.actors.find(a => a._id === t.actorId)?.flags?.ordemparanormal2).toMatchObject({ adventureImport: { documentId: `actOne.${String(t.name).toLowerCase().replace("ê", "e")}` } });
    expect(f.flag()).toMatchObject({ state: "complete", presetRevision: 2, baseline: { embedded: expect.any(Array) } });
    f.clearWrites();
    expect(await importAdventureScenes(f.input)).toMatchObject({ unchanged: 1 });
    f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
    expect(f.input.decide).not.toHaveBeenCalled();
  });
  it.each([
    { acts: ["actOne"] as const, expected: ["actOne.basement"] },
    { acts: ["actTwo"] as const, expected: ["actTwo.basement"] },
    { acts: ["actOne", "actTwo"] as const, expected: ["actOne.basement", "actTwo.basement"] },
  ])("imports only the Scene presets selected by materializedActs: $acts", async ({ acts, expected }) => {
    const f = sceneImportFixture({ materializedActs: acts });
    expect(await importAdventureScenes(f.input)).toMatchObject({ created: expected.length, updated: 0 });
    expect(f.world.map(scene => importFlag(scene)?.documentId)).toEqual(expected);
    expect(f.world.map(scene => scene.folder)).toEqual(expected.map(id => id.startsWith("actOne.") ? "Scene-actOne" : "Scene-actTwo"));
  });
  it("adds the derived overlay when available and preserves opened runtime state across reruns", async () => {
    const f = sceneImportFixture({ materializedActs: ["actOne", "actTwo"] });
    const derivedAssets = { "actOne.basement.bookshelfOpen": { status: "available" as const,
      path: "worlds/test/ordemparanormal2/adventures/playtest-alpha/act-1/generated-bookshelf-open-r1.png" } };
    const input = { ...f.input, derivedAssets };
    expect(await importAdventureScenes(input)).toMatchObject({ created: 2 });
    const scene = f.scene("actOne.basement")!;
    const overlay = scene.tiles.find(tile => tile._id === "qGwblo0LY1FdVwox")!;
    expect(overlay).toMatchObject({ hidden: true, locked: false, levels: ["defaultLevel0000"],
      texture: { src: derivedAssets["actOne.basement.bookshelfOpen"].path } });
    expect(scene.tiles.find(tile => tile._id === "GTcIdC5fkuM9N8oA")?.flags?.ordemparanormal2)
      .toMatchObject({ tileInteraction: { wallIds: ["VcHyOosYEwvc5Ha3", "iopl6aKxarBdRzP4"], tileIds: [overlay._id] } });
    overlay.hidden = false;
    for (const id of ["VcHyOosYEwvc5Ha3", "iopl6aKxarBdRzP4"]) scene.walls.find(wall => wall._id === id)!.ds = 1;
    f.clearWrites();
    expect(await importAdventureScenes(input)).toMatchObject({ unchanged: 2 });
    f.writes().forEach(write => expect(write).not.toHaveBeenCalled());
    expect(scene.tiles.find(tile => tile._id === overlay._id)?.hidden).toBe(false);
    const actOneOnly = { ...input, materialization: { ...input.materialization, materializedActs: ["actOne" as const] } };
    expect(await importAdventureScenes(actOneOnly)).toMatchObject({ unchanged: 1 });
    expect(f.scene("actOne.basement")!.tiles.find(tile => tile._id === overlay._id)?.hidden).toBe(false);
  });

  it("keeps Act I mechanical without the source and removes only an unavailable managed overlay", async () => {
    const f = sceneImportFixture();
    await importAdventureScenes(f.input);
    expect(f.world[0].tiles).toHaveLength(3);
    expect((f.world[0].tiles.find(tile => tile._id === "GTcIdC5fkuM9N8oA")!.flags!.ordemparanormal2 as
      { tileInteraction: { tileIds: string[] } }).tileInteraction.tileIds).toEqual([]);
    const path = "worlds/test/generated-bookshelf-open-r1.png";
    const available = { ...f.input, derivedAssets: { "actOne.basement.bookshelfOpen": { status: "available" as const, path } } };
    await importAdventureScenes(available);
    f.world[0].tiles.push({ _id: "manual-tile", flags: { other: { keep: true } } });
    expect(await importAdventureScenes(f.input)).toMatchObject({ updated: 1 });
    expect(f.world[0].tiles.some(tile => tile._id === "qGwblo0LY1FdVwox")).toBe(false);
    expect(f.world[0].tiles.some(tile => tile._id === "manual-tile")).toBe(true);
    expect((f.world[0].tiles.find(tile => tile._id === "GTcIdC5fkuM9N8oA")!.flags!.ordemparanormal2 as
      { tileInteraction: { tileIds: string[] } }).tileInteraction.tileIds).toEqual([]);
  });

  it("skips an existing Act I Scene when output lookup is uncertain while importing Act II", async () => {
    const f = sceneImportFixture({ materializedActs: ["actOne", "actTwo"] });
    await importAdventureScenes(f.input);
    const before = structuredClone(f.scene("actOne.basement"));
    const input = { ...f.input, derivedAssets: { "actOne.basement.bookshelfOpen": {
      status: "failed" as const, reason: "lookup" as const, error: new Error("browse failed") } } };
    expect(await importAdventureScenes(input)).toMatchObject({ unchanged: 1 });
    expect(f.scene("actOne.basement")).toEqual(before);
  });
  it("creates and reconciles the Act II Scene with semantic assets, stable IDs and preserved runtime state", async () => {
    const f = sceneImportFixture({ materializedActs: ["actTwo"] });
    const preset = f.input.presets.find(candidate => candidate.id === "actTwo.basement")!;
    expect(await importAdventureScenes(f.input)).toMatchObject({ created: 1 });
    const scene = f.scene("actTwo.basement")!;
    expect(scene.levels[0]).toMatchObject({ _id: "defaultLevel0000", background: { src: "worlds/test/actTwo.basement.map.png" } });
    expect(scene.walls.map(wall => wall._id)).toEqual(preset.walls.map(wall => wall.id));
    expect(scene.tokens.map(token => token._id)).toEqual(preset.tokens.map(token => token.id));
    for (const token of scene.tokens) {
      const actor = f.actors.find(candidate => candidate._id === token.actorId)!;
      const documentId = importFlag(actor)!.documentId as string;
      expect(preset.tokens.find(candidate => candidate.id === token._id)?.agentPresetId).toBe(documentId);
      expect(token.texture).toMatchObject({ src: `worlds/test/${documentId}.token.png` });
    }
    scene.tokens[0].x = 999; scene.tokens[0].y = 888;
    const door = scene.walls.find(wall => wall._id === "YvDltkrAU0I722fZ")!; door.ds = 1;
    scene.folder = "manual-folder";
    scene.walls = [...scene.walls, { _id: "manual-wall", c: [1, 2, 3, 4], flags: { other: { keep: true } } }];
    scene.regions = [{ _id: "manual-region", name: "POI posterior" }];
    scene.walls[0].c = [9, 8, 7, 6];
    expect(await importAdventureScenes(f.input)).toMatchObject({ updated: 1 });
    const reconciled = f.scene("actTwo.basement")!;
    expect(reconciled.tokens[0]).toMatchObject({ x: 999, y: 888 });
    expect(reconciled.walls.find(wall => wall._id === "YvDltkrAU0I722fZ")?.ds).toBe(1);
    expect(reconciled.folder).toBe("manual-folder");
    expect(reconciled.walls.at(-1)).toMatchObject({ _id: "manual-wall" });
    expect(reconciled.regions).toEqual([{ _id: "manual-region", name: "POI posterior" }]);
    f.clearWrites();
    expect(await importAdventureScenes(f.input)).toMatchObject({ unchanged: 1 });
    f.writes().forEach(write => expect(write).not.toHaveBeenCalled());
  });
  it("preserves runtime state, manual content and renames even during restore", async () => {
    const f = sceneImportFixture(); await importAdventureScenes(f.input);
    const s = f.world[0]; s.name = "Renomeada"; s.folder = "manual-folder"; s.ownership = { default: 2 }; s.initial = { x: 12, y: 34, scale: 1 };
    s.tokens[0].x = 123; s.tokens[0].elevation = 4; s.tokens[0].level = "manualLevel00000x"; s.tokens[0].name = "Token renomeado";
    s.walls[8].ds = 1; s.tiles[0].hidden = true; s.drawings[0].locked = true;
    s.fog = { ...s.fog as object, reset: 999 };
    for (const collection of Object.values(SCENE_COLLECTIONS)) s[collection] = [...s[collection], { _id: `manual-${collection}`, label: "manual", flags: { other: { keep: true } } }];
    s.lights = [{ _id: "manual-light", bright: 42 }]; s.regions = [{ _id: "manual-region", name: "POI posterior" }];
    const manualBefore = structuredClone(s);
    f.clearWrites();
    expect(await importAdventureScenes(f.input)).toMatchObject({ unchanged: 1 });
    f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
    f.world[0].walls[0].c = [1, 2, 3, 4];
    expect(await importAdventureScenes(f.input)).toMatchObject({ updated: 1 });
    expect(f.input.decide).toHaveBeenCalledOnce();
    expect(f.world[0]).toMatchObject({ name: "Renomeada", folder: "manual-folder", ownership: { default: 2 }, fog: { reset: 999 }, lights: manualBefore.lights, regions: manualBefore.regions });
    expect(f.world[0].tokens[0]).toMatchObject({ x: 123, elevation: 4, level: "manualLevel00000x", name: "Token renomeado" });
    expect(f.world[0].walls[8].ds).toBe(1); expect(f.world[0].tiles[0].hidden).toBe(true); expect(f.world[0].drawings[0].locked).toBe(true);
    for (const collection of Object.values(SCENE_COLLECTIONS)) expect(f.world[0][collection].at(-1)).toEqual(manualBefore[collection].at(-1));
  });
  it("does not adopt a manual homonym, and recreates a deleted imported Scene once", async () => {
    const f = sceneImportFixture();
    const manual: AdventureSceneSource = { _id: "manual", name: "O Porão", levels: [], walls: [], tiles: [], tokens: [], drawings: [] };
    f.world.push(manual as unknown as typeof f.world[number]); await importAdventureScenes(f.input);
    expect(f.world).toHaveLength(2); expect(f.world[0]).toEqual(manual);
    f.world.splice(1, 1); await importAdventureScenes(f.input); await importAdventureScenes(f.input);
    expect(f.world).toHaveLength(2); expect(f.port.createScene).toHaveBeenCalledTimes(2);
  });
  it.each(["preserve", null] as const)("does no Scene writes for decision %s", async decision => {
    const f = sceneImportFixture(); await importAdventureScenes(f.input); f.world[0].walls[0].c = [1, 2, 3, 4];
    const before = structuredClone(f.world); f.clearWrites(); f.input.decide.mockResolvedValueOnce(decision);
    const result = await importAdventureScenes(f.input);
    expect(result).toMatchObject(decision === null ? { cancelled: true } : { preserved: 1 });
    expect(f.world).toEqual(before); f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("normalizes the unfiled revision-one Scene once, including when managed divergence is preserved", async () => {
    const f = sceneImportFixture(); await importAdventureScenes(f.input);
    const scope = f.world[0].flags!.ordemparanormal2 as Record<string, unknown>;
    (scope.adventureImport as { presetRevision: number }).presetRevision = 1;
    delete scope.adventureImportFolder; f.world[0].folder = null; f.world[0].walls[0].c = [1, 2, 3, 4];
    f.clearWrites(); f.input.decide.mockResolvedValueOnce("preserve");
    expect(await importAdventureScenes(f.input)).toMatchObject({ preserved: 1 });
    expect(f.world[0].folder).toBe("Scene-actOne");
    expect((f.world[0].flags!.ordemparanormal2 as Record<string, unknown>).adventureImportFolder)
      .toMatchObject({ documentType: "Scene", documentId: "actOne.basement", act: "actOne" });
    expect(f.port.updateFolderPlacement).toHaveBeenCalledOnce();
    f.world[0].folder = "manual-folder"; f.clearWrites(); f.input.decide.mockResolvedValueOnce("preserve");
    await importAdventureScenes(f.input);
    expect(f.world[0].folder).toBe("manual-folder");
    expect(f.port.updateFolderPlacement).not.toHaveBeenCalled();
  });
  it("applies revision additions and removals while keeping runtime and IDs", async () => {
    const f = sceneImportFixture(); await importAdventureScenes(f.input); f.world[0].tokens[0].x = 987;
    const preset = structuredClone(f.input.presets[0]);
    const revised = { ...preset, revision: 3, walls: [...preset.walls.slice(1), { ...preset.walls[0], id: "newWall00000000x" }] };
    expect(await importAdventureScenes({ ...f.input, presets: f.input.presets.map(candidate => candidate.id === revised.id ? revised : candidate) })).toMatchObject({ updated: 1 });
    expect(f.input.decide).not.toHaveBeenCalled(); expect(f.world[0].tokens[0].x).toBe(987);
    expect(f.world[0].walls.some(w => w._id === preset.walls[0].id)).toBe(false);
    expect(f.world[0].walls.some(w => w._id === "newWall00000000x")).toBe(true);
    expect(f.flag()?.presetRevision).toBe(3);
    f.clearWrites(); await expect(importAdventureScenes(f.input)).rejects.toThrow("mais recente");
    f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("detects managed deletion and restores it with the stable ID", async () => {
    const f = sceneImportFixture(); await importAdventureScenes(f.input);
    const id = f.world[0].tokens[0]._id; f.world[0].tokens = f.world[0].tokens.slice(1);
    await importAdventureScenes(f.input); expect(f.input.decide).toHaveBeenCalledOnce();
    expect(f.world[0].tokens.filter(t => t._id === id)).toHaveLength(1);
  });
  it("preflights every selected Scene before writes when an Act II Actor is missing", async () => {
    const f = sceneImportFixture({ materializedActs: ["actOne", "actTwo"] });
    f.actors.splice(f.actors.findIndex(actor => importFlag(actor)?.documentId === "actTwo.heitor"), 1);
    await expect(importAdventureScenes(f.input)).rejects.toThrow("actTwo.heitor");
    expect(f.world).toEqual([]); f.writes().forEach(write => expect(write).not.toHaveBeenCalled());
  });
  it.each(["asset", "actor", "duplicateActor", "incompleteActor", "schema", "references", "model", "authority"])("preflights %s with zero writes", async kind => {
    const f = sceneImportFixture();
    if (kind === "asset") {
      const token = f.actors.map(actor => importFlag(actor)!.tokenAssetId as string)[0];
      const reference = f.input.definition.assets.find(asset => asset.id === token)!;
      f.input.materialization.assets = f.input.materialization.assets.filter(asset => asset.originalEntryPath !== reference.source.originalEntryPath);
    }
    if (kind === "actor") f.actors.pop();
    if (kind === "duplicateActor") f.actors.push(structuredClone(f.actors[0]));
    if (kind === "incompleteActor") importFlag(f.actors[0])!.state = "incomplete";
    if (kind === "schema") (f.input.presets[0] as unknown as Record<string, unknown>).regions = [];
    if (kind === "references") (f.input.presets[0].tiles[0].interaction as unknown as { wallIds: string[] }).wallIds = ["missingWall00000x"];
    if (kind === "model") vi.mocked(f.port.validateCandidate).mockImplementationOnce(() => { throw new Error("invalid model"); });
    if (kind === "authority") vi.mocked(f.port.isAuthorized).mockReturnValue(false);
    await expect(importAdventureScenes(f.input)).rejects.toBeInstanceOf(SceneImportError);
    f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("blocks duplicate Scene identities, malformed provenance and manual ID collisions", async () => {
    const f = sceneImportFixture(); await importAdventureScenes(f.input);
    f.world.push({ ...structuredClone(f.world[0]), _id: "duplicate" }); f.clearWrites();
    await expect(importAdventureScenes(f.input)).rejects.toThrow("duplicada"); f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
    f.world.pop(); delete f.world[0].walls[0].flags;
    await expect(importAdventureScenes(f.input)).rejects.toThrow("Colisão"); f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
    f.world[0].walls[0].flags = { ordemparanormal2: { adventureImport: { importer: "sceneEmbedded" } } };
    await expect(importAdventureScenes(f.input)).rejects.toThrow("Provenance");
  });
  it("blocks removal of a managed target referenced by a manual controller", async () => {
    const f = sceneImportFixture(); await importAdventureScenes(f.input);
    const preset = f.input.presets[0]; const id = preset.walls[0].id;
    f.world[0].tiles = [...f.world[0].tiles, { _id: "manual-control", flags: { ordemparanormal2: { tileInteraction: { enabled: true, wallIds: [id], tileIds: [] } } } }];
    f.clearWrites();
    const revised = { ...preset, revision: 2, walls: preset.walls.slice(1) };
    await expect(importAdventureScenes({ ...f.input, presets: f.input.presets.map(candidate => candidate.id === revised.id ? revised : candidate) })).rejects.toThrow("interação manual");
    f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("aborts stale confirmation and changed Actor bindings before writes", async () => {
    const f = sceneImportFixture(); await importAdventureScenes(f.input); f.world[0].walls[0].c = [1, 2, 3, 4]; f.clearWrites();
    f.input.decide.mockImplementationOnce(async () => { f.actors[0].prototypeToken = { width: 5 }; return "restore"; });
    await expect(importAdventureScenes(f.input)).rejects.toThrow("Actor mudou"); f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
    f.input.decide.mockImplementationOnce(async () => { f.world[0].walls[1].c = [5, 6, 7, 8]; return "restore"; });
    await expect(importAdventureScenes(f.input)).rejects.toThrow("Scene mudou"); f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("retains incomplete identity on operational failure and recovers on rerun", async () => {
    const f = sceneImportFixture(); vi.mocked(f.port.completeScene).mockRejectedValueOnce(new Error("write failed"));
    await expect(importAdventureScenes(f.input)).rejects.toMatchObject({ stage: "baseline", counts: { created: 0 } });
    expect(f.world).toHaveLength(1); expect(f.flag()?.state).toBe("incomplete");
    expect(await importAdventureScenes(f.input)).toMatchObject({ updated: 1 });
    expect(f.world).toHaveLength(1); expect(f.flag()?.state).toBe("complete");
  });
  it("blocks concurrent import calls and stops on active-GM change", async () => {
    const f = sceneImportFixture(); let release!: () => void;
    const prepareToken = vi.mocked(f.port.prepareToken).getMockImplementation()!;
    vi.mocked(f.port.prepareToken).mockImplementationOnce(async (...args) => {
      await new Promise<void>(resolve => { release = resolve; }); return prepareToken(...args);
    });
    const pending = importAdventureScenes(f.input);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(importAdventureScenes(f.input)).rejects.toThrow("andamento"); release(); await pending;
    f.world[0].walls[0].c = [1, 2, 3, 4]; f.clearWrites();
    f.input.decide.mockImplementationOnce(async () => { vi.mocked(f.port.isAuthorized).mockReturnValue(false); return "restore"; });
    await expect(importAdventureScenes(f.input)).rejects.toThrow("GM ativo mudou"); f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
});
