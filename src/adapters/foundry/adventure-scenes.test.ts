import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdventureScenePort } from "./adventure-scenes";
import { sceneImportFixture } from "../../features/adventure-import/adventure-scene-test-fixtures";
import { prepareAdventureScenes } from "../../features/adventure-import/prepare-adventure-scenes";
import { sceneConfigurationProjection, sceneEmbeddedProjection, type AdventureSceneSource } from "../../core/adventure-import/adventure-scene-reconciliation";
import { PLAYTEST_ALPHA_SCENE_PRESETS } from "../../config/adventure-scene-presets/playtest-alpha";

class Replacement { static create(value: unknown) { return new Replacement(value); } constructor(readonly value: unknown) {} }
let source: AdventureSceneSource;
let normalize: (data: AdventureSceneSource) => AdventureSceneSource;
const update = vi.fn();
const create = vi.fn();
const batch = vi.fn();
const browse = vi.fn();
const getToken = vi.fn();
const placement = { version: 1 as const, adventureId: "playtest-alpha", documentType: "Scene" as const,
  documentId: "actOne.basement", act: "actOne" as const };
class NativeScene {
  readonly id = "scene";
  constructor(readonly data: AdventureSceneSource) {}
  toObject() { return normalize(structuredClone(this.data)); }
  validate() { return true; }
  static create = create;
}
beforeEach(async () => {
  const fixture = sceneImportFixture(); source = (await prepareAdventureScenes(fixture.input))[0].desired;
  normalize = data => data;
  update.mockReset().mockImplementation(async (changes: Record<string, unknown>) => {
    const flag = changes["flags.ordemparanormal2.adventureImport"] as Replacement;
    (source as Record<string, unknown>).flags = { ordemparanormal2: { adventureImport: flag.value } };
    return undefined;
  });
  create.mockReset().mockImplementation(async data => ({ id: "new-scene", toObject: () => data }));
  batch.mockReset().mockResolvedValue([]); browse.mockReset().mockResolvedValue({ files: ["worlds/test/My%20Token.png"] });
  getToken.mockReset().mockImplementation(async data => ({ toObject: () => ({ ...data, _id: "randomId00000000", flags: { tokenizer: { path: "authoring" } }, _stats: { old: true }, _regions: ["old"], delta: { actor: "old" }, _movementHistory: ["old"] }) }));
  vi.stubGlobal("game", { user: { isGM: true, id: "gm" }, users: { activeGM: { id: "gm" } },
    actors: { contents: [], get: () => ({ getTokenDocument: getToken }) },
    scenes: { contents: [], get: () => ({ toObject: () => source, update }) } });
  vi.stubGlobal("foundry", { documents: { Scene: { implementation: NativeScene }, modifyBatch: batch },
    applications: { apps: { FilePicker: { browse } } }, data: { operators: { ForcedReplacement: Replacement } } });
});
afterEach(() => vi.unstubAllGlobals());
describe("Foundry Scene adapter", () => {
  it("validates prepared native configuration and embedded IDs before persistence", () => {
    expect(() => createAdventureScenePort().validateCandidate(source)).not.toThrow();
    normalize = data => ({ ...data, width: 12 });
    expect(() => createAdventureScenePort().validateCandidate(source)).toThrow("configuração");
    normalize = data => ({ ...data, walls: [] });
    expect(() => createAdventureScenePort().validateCandidate(source)).toThrow("IDs");
    normalize = data => ({ ...data, tiles: data.tiles.map(t => ({ ...t, width: 9 })) });
    expect(() => createAdventureScenePort().validateCandidate(source)).toThrow("Tile");
    expect(create).not.toHaveBeenCalled(); expect(batch).not.toHaveBeenCalled();
  });
  it("creates a Scene without adopting the authoring Scene ID and keeps embedded IDs", async () => {
    expect(await createAdventureScenePort().createScene(source, "scene-act-one", placement)).toBe("new-scene");
    const [data, options] = create.mock.calls[0];
    expect(data).not.toHaveProperty("_id"); expect(options).toEqual({ keepEmbeddedIds: true, renderSheet: false });
    expect(data).toMatchObject({ active: false, folder: "scene-act-one", levels: [{ _id: "defaultLevel0000" }],
      flags: { ordemparanormal2: { adventureImportFolder: placement } } });
  });
  it("prepares Tokens through the public Actor API, with semantic assets and no authoring metadata", async () => {
    const preset = PLAYTEST_ALPHA_SCENE_PRESETS[0].tokens[0];
    const token = await createAdventureScenePort().prepareToken("actor", preset, "worlds/test/token.png", "defaultLevel0000");
    expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ actorId: "actor", actorLink: true, level: "defaultLevel0000", x: 2600, y: 1800 }));
    expect(token).toMatchObject({ _id: preset.id, texture: { src: "worlds/test/token.png" } });
    for (const key of ["_stats", "flags", "_movementHistory", "_regions", "delta"]) expect(token).not.toHaveProperty(key);
  });
  it("does not browse World storage for Scene assets", async () => {
    const port = createAdventureScenePort();
    expect(port).not.toHaveProperty("confirmAsset");
    await port.prepareToken("actor", PLAYTEST_ALPHA_SCENE_PRESETS[0].tokens[0], "https://assets.example.test/token.png", "defaultLevel0000");
    await port.createScene(source, "scene-act-one", placement);
    expect(browse).not.toHaveBeenCalled();
  });
  it("uses one public batch and updates only managed paths, preserving fog reset and runtime", async () => {
    const tile = source.tiles[0], token = source.tokens[0], wall = source.walls[0];
    await createAdventureScenePort().applyChanges("scene", source, [
      { type: "Wall", creates: [], updates: [wall], deletes: [] },
      { type: "Tile", creates: [source.tiles[1]], updates: [tile], deletes: ["obsolete"] },
      { type: "Token", creates: [], updates: [token], deletes: [] },
    ]);
    expect(batch).toHaveBeenCalledOnce(); const operations = batch.mock.calls[0][0];
    const config = operations[0].updates[0];
    expect(config).not.toHaveProperty("fog"); expect(config).toHaveProperty("fog.mode"); expect(config).not.toHaveProperty("fog.reset");
    for (const key of ["name", "folder", "active", "ownership", "levels", "tokens", "walls", "tiles", "drawings"]) expect(config).not.toHaveProperty(key);
    for (const operation of operations.slice(1)) if (operation.action === "update") for (const change of operation.updates) {
      for (const key of ["ds", "hidden", "locked", "name"]) expect(change).not.toHaveProperty(key);
      if (operation.documentName === "Token") for (const key of ["x", "y", "rotation", "elevation", "level"]) expect(change).not.toHaveProperty(key);
    }
    const tileUpdate = operations.find((o: { action: string; documentName: string }) => o.action === "update" && o.documentName === "Tile").updates[0];
    expect(tileUpdate["flags.ordemparanormal2.tileInteraction"]).toBeInstanceOf(Replacement);
    expect(operations.find((o: { action: string }) => o.action === "create")).toMatchObject({ keepId: true });
    expect(operations.at(-1)).toMatchObject({ action: "delete", documentName: "Tile", ids: ["obsolete"] });
  });
  it("accepts undefined update results when incomplete metadata was persisted", async () => {
    const flag = (source.flags!.ordemparanormal2 as { adventureImport: unknown }).adventureImport;
    await expect(createAdventureScenePort().markIncomplete("scene", flag as Parameters<ReturnType<typeof createAdventureScenePort>["markIncomplete"]>[1])).resolves.toBeUndefined();
  });
  it("guards writes when the active GM changes", async () => {
    vi.stubGlobal("game", { user: { isGM: true, id: "other" }, users: { activeGM: { id: "gm" } } });
    await expect(createAdventureScenePort().createScene(source, "scene-act-one", placement)).rejects.toThrow("GM ativo"); expect(create).not.toHaveBeenCalled();
  });
  it("excludes gameplay state from managed projections", () => {
    expect(sceneConfigurationProjection({ ...source, fog: { ...source.fog as object, reset: 999 } })).toEqual(sceneConfigurationProjection(source));
    expect(sceneEmbeddedProjection("Wall", { ...source.walls[0], ds: 1 })).toEqual(sceneEmbeddedProjection("Wall", source.walls[0]));
    expect(sceneEmbeddedProjection("Token", { ...source.tokens[0], x: 999, elevation: 3 })).toEqual(sceneEmbeddedProjection("Token", source.tokens[0]));
  });
});
