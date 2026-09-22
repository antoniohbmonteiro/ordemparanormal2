import { describe, expect, it } from "vitest";
import { PLAYTEST_ALPHA_SCENE_PRESETS } from "../../config/adventure-scene-presets/playtest-alpha";
import { PLAYTEST_ALPHA_ADVENTURE } from "../../config/adventure-definitions/playtest-alpha";
import { validateAdventureSceneData } from "./adventure-scene-data";
import { validateAdventureSceneReferences } from "../../features/adventure-import/prepare-adventure-scenes";

describe("adventure Scene preset", () => {
  it("contains the reviewed configuration, without authoring paths or the deferred furniture", () => {
    const p = PLAYTEST_ALPHA_SCENE_PRESETS.find(preset => preset.id === "actOne.basement")!;
    expect(p).toMatchObject({ id: "actOne.basement", revision: 1, scene: { width: 3537, height: 3750, padding: 0.25, shiftX: 40 },
      level: { id: "defaultLevel0000", backgroundAssetId: "actOne.basement.completeMap", elevation: { bottom: 0, top: 20 } } });
    expect(p.walls).toHaveLength(168); expect(p.tiles).toHaveLength(3); expect(p.tokens).toHaveLength(5); expect(p.drawings).toHaveLength(3);
    expect(p.walls.filter(w => w.door === 1)).toHaveLength(3); expect(p.walls.filter(w => w.door === 2)).toHaveLength(6);
    expect(p.walls.find(w => w.id === "Fnkz5vNIPbaAKxGT")?.initialState).toBe(2);
    expect(p.tiles.map(t => t.interaction.wallIds)).toEqual([
      ["VlToLKiyERpUpHj2", "XvYD5GtqFSGM4G0W"], ["ub57IcVU4LN4MnJI", "vRJhupXcEghW4hgo"], ["VcHyOosYEwvc5Ha3", "iopl6aKxarBdRzP4"],
    ]);
    expect(p.tokens.map(t => [t.agentPresetId, t.initial.x, t.initial.y])).toEqual([
      ["actOne.alan", 2600, 1800], ["actOne.kenia", 2800, 1400], ["actOne.victor", 2900, 2000], ["actOne.edgar", 1900, 2200], ["actOne.eloisa", 1500, 2200],
    ]);
    expect(JSON.stringify(p)).not.toMatch(/worlds\/|assets\/|_stats|actorId|ownership|folder|thumb|HXiElhZ9UlLaRLYE|regions|tokenizer/i);
    expect(p.tiles.every(t => !t.interaction.tileIds.length)).toBe(true);
    expect(() => validateAdventureSceneReferences(PLAYTEST_ALPHA_ADVENTURE, PLAYTEST_ALPHA_SCENE_PRESETS)).not.toThrow();
  });
  it("contains the reviewed Act II basement with semantic references and no authoring data", () => {
    const p = PLAYTEST_ALPHA_SCENE_PRESETS.find(preset => preset.id === "actTwo.basement")!;
    expect(p).toMatchObject({ id: "actTwo.basement", act: "actTwo", revision: 1, name: "O Porão — Ato II",
      scene: { width: 3537, height: 4101, padding: 0.25, shiftX: 0, shiftY: 60, grid: { size: 100 } },
      level: { id: "defaultLevel0000", backgroundAssetId: "actTwo.basement.map", elevation: { bottom: 0, top: 20 } } });
    expect(p.walls).toHaveLength(145); expect(p.tiles).toEqual([]); expect(p.tokens).toHaveLength(5); expect(p.drawings).toEqual([]);
    expect(p.walls.filter(wall => wall.door !== 0)).toEqual([
      expect.objectContaining({ id: "YvDltkrAU0I722fZ", door: 1, initialState: 0 }),
      expect.objectContaining({ id: "CHxDav9JWMo0k288", door: 1, initialState: 0 }),
    ]);
    expect(p.tokens.map(token => [token.id, token.agentPresetId, token.initial.x, token.initial.y])).toEqual([
      ["LBS6PqHB8wg1r0aO", "actTwo.heitor", 1700, 3000],
      ["lJ7plTc3XebA8rlD", "actTwo.raven", 1600, 3000],
      ["sItl7QYOqSkBab7z", "actTwo.amanda", 1600, 3100],
      ["ZM8qkx8Mix25dxza", "actTwo.val", 1500, 3200],
      ["ftJJRNmXcv6qlFVp", "actTwo.antonio", 1600, 3200],
    ]);
    expect(JSON.stringify(p)).not.toMatch(/worlds\/|assets\/|_stats|actorId|ownership|folder|thumb|regions|tokenizer/i);
    expect(Object.hasOwn(p, "regions")).toBe(false);
    expect(PLAYTEST_ALPHA_ADVENTURE.scenes.map(scene => scene.presetId)).toEqual(["actOne.basement", "actTwo.basement"]);
    expect(() => validateAdventureSceneReferences(PLAYTEST_ALPHA_ADVENTURE, PLAYTEST_ALPHA_SCENE_PRESETS)).not.toThrow();
  });
  it.each([
    (p: Record<string, unknown>) => { p.regions = []; },
    (p: Record<string, unknown>) => { p.revision = 0; },
    (p: Record<string, unknown>) => { (p.scene as Record<string, unknown>).width = NaN; },
    (p: Record<string, unknown>) => { (p.walls as unknown[]).push((p.walls as unknown[])[0]); },
    (p: Record<string, unknown>) => { ((p.tiles as { interaction: { wallIds: string[] } }[])[0].interaction.wallIds) = ["missingWall00000x"]; },
    (p: Record<string, unknown>) => { ((p.tiles as { interaction: { tileIds: string[] }; id: string }[])[0].interaction.tileIds) = [(p.tiles as { id: string }[])[0].id]; },
    (p: Record<string, unknown>) => { (p.tokens as { configuration: { actorLink: boolean } }[])[0].configuration.actorLink = false; },
  ])("rejects invalid data rather than cleaning it silently", mutate => {
    const p = structuredClone(PLAYTEST_ALPHA_SCENE_PRESETS[0]) as unknown as Record<string, unknown>;
    mutate(p); expect(() => validateAdventureSceneData(p)).toThrow();
  });
});
