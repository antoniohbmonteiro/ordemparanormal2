import { describe, expect, it } from "vitest";
import { PLAYTEST_ALPHA_ADVENTURE } from "../../config/adventure-definitions/playtest-alpha";
import { PLAYTEST_ALPHA_SCENE_PRESETS } from "../../config/adventure-scene-presets/playtest-alpha";
import type { AdventureDefinition } from "./adventure-definition";
import { validateAdventureImageCrops } from "./adventure-image-crop";

describe("adventure image crop recipe", () => {
  it("declares the exact source, crop and output without distributing authoring pixels", () => {
    expect(PLAYTEST_ALPHA_ADVENTURE.imageCrops).toEqual([{
      id: "actOne.basement.bookshelfOpen", consumerAct: "actOne", sourceAssetId: "actTwo.basement.map", revision: 1,
      crop: { x: 2486, y: 1815, width: 200, height: 440 },
      target: { width: 200, height: 440, mimeType: "image/png" },
      basename: "generated-bookshelf-open-r1.png",
    }]);
    expect(JSON.stringify(PLAYTEST_ALPHA_ADVENTURE.imageCrops)).not.toContain("bookshelf_open.png");
    expect(() => validateAdventureImageCrops(PLAYTEST_ALPHA_ADVENTURE, PLAYTEST_ALPHA_SCENE_PRESETS)).not.toThrow();
  });

  it.each([
    (r: Record<string, unknown>) => { r.sourceAssetId = "actOne.kenia.portrait"; },
    (r: Record<string, unknown>) => { r.crop = { x: -1, y: 0, width: 200, height: 440 }; },
    (r: Record<string, unknown>) => { r.target = { width: 201, height: 440, mimeType: "image/png" }; },
    (r: Record<string, unknown>) => { r.basename = "../generated-bookshelf-open-r1.png"; },
    (r: Record<string, unknown>) => { r.revision = 2; },
  ])("rejects invalid source, coordinates, output or versioned path", mutate => {
    const definition = structuredClone(PLAYTEST_ALPHA_ADVENTURE) as AdventureDefinition;
    mutate((definition.imageCrops as unknown as Record<string, unknown>[])[0]);
    expect(() => validateAdventureImageCrops(definition, PLAYTEST_ALPHA_SCENE_PRESETS)).toThrow();
  });
});
