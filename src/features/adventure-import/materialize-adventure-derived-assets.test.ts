import { describe, expect, it, vi } from "vitest";
import { PLAYTEST_ALPHA_ADVENTURE } from "../../config/adventure-definitions/playtest-alpha";
import { PLAYTEST_ALPHA_SCENE_PRESETS } from "../../config/adventure-scene-presets/playtest-alpha";
import type { AdventureAssetStorage } from "../../adapters/foundry/adventure-asset-storage";
import type { AdventureImageCropPort } from "../../adapters/files/adventure-image-crop";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import { materializeAdventureDerivedAssets } from "./materialize-adventure-derived-assets";

const directory = "worlds/test/ordemparanormal2/adventures/playtest-alpha/act-1";
const path = `${directory}/generated-bookshelf-open-r1.png`;
const id = "actOne.basement.bookshelfOpen";

function fixture(acts: readonly AdventureAct[]) {
  const storage: AdventureAssetStorage = {
    worldId: "test",
    findExisting: vi.fn(async () => null),
    ensureDirectories: vi.fn(async () => {}),
    uploadAndConfirm: vi.fn(async () => path),
  };
  const images: AdventureImageCropPort = {
    inspect: vi.fn(async () => "valid" as const),
    crop: vi.fn(async () => new Blob(["synthetic"], { type: "image/png" })),
  };
  const materialization = { materializedActs: acts, assets: acts.includes("actTwo") ? [
    { act: "actTwo" as const, originalEntryPath: "Mapa/Mapa 01 - O Porão.jpg", storedPath: "worlds/test/act-2/map.jpg" },
  ] : [] };
  const input = { definition: PLAYTEST_ALPHA_ADVENTURE, presets: PLAYTEST_ALPHA_SCENE_PRESETS, materialization, storage, images };
  return { input, storage, images };
}

describe("optional adventure overlay materialization", () => {
  it("does no lookup or crop when only Act II is selected", async () => {
    const f = fixture(["actTwo"]);
    expect(await materializeAdventureDerivedAssets(f.input)).toEqual({});
    expect(f.storage.findExisting).not.toHaveBeenCalled();
    expect(f.images.crop).not.toHaveBeenCalled();
  });

  it("leaves Act I mechanical when the output and Act II source are absent", async () => {
    const f = fixture(["actOne"]);
    expect(await materializeAdventureDerivedAssets(f.input)).toEqual({ [id]: { status: "absent" } });
    expect(f.storage.findExisting).toHaveBeenCalledExactlyOnceWith(directory, "generated-bookshelf-open-r1.png");
    expect(f.storage.uploadAndConfirm).not.toHaveBeenCalled();
  });

  it("generates once from the just-materialized Act II map and reuses the output later", async () => {
    const f = fixture(["actOne", "actTwo"]);
    expect(await materializeAdventureDerivedAssets(f.input)).toEqual({ [id]: { status: "available", path } });
    expect(f.images.crop).toHaveBeenCalledWith("worlds/test/act-2/map.jpg", PLAYTEST_ALPHA_ADVENTURE.imageCrops[0]);
    expect(f.storage.uploadAndConfirm).toHaveBeenCalledOnce();
    const uploaded = vi.mocked(f.storage.uploadAndConfirm).mock.calls[0][1];
    expect(uploaded).toMatchObject({ name: "generated-bookshelf-open-r1.png", type: "image/png" });
    vi.mocked(f.storage.findExisting).mockResolvedValue(path);
    vi.mocked(f.storage.uploadAndConfirm).mockClear(); vi.mocked(f.images.crop).mockClear();
    expect(await materializeAdventureDerivedAssets({ ...f.input, materialization: fixture(["actOne"]).input.materialization }))
      .toEqual({ [id]: { status: "available", path } });
    expect(f.storage.uploadAndConfirm).not.toHaveBeenCalled();
    expect(f.images.crop).not.toHaveBeenCalled();
  });

  it("does not trust an invalid stored image and attempts regeneration only with Act II available", async () => {
    const f = fixture(["actOne"]);
    vi.mocked(f.storage.findExisting).mockResolvedValue(path);
    vi.mocked(f.images.inspect).mockResolvedValueOnce("invalid");
    expect(await materializeAdventureDerivedAssets(f.input)).toEqual({ [id]: { status: "absent" } });
    expect(f.storage.uploadAndConfirm).not.toHaveBeenCalled();
    vi.mocked(f.images.inspect).mockResolvedValueOnce("invalid").mockResolvedValueOnce("valid");
    const withActTwo = fixture(["actOne", "actTwo"]);
    expect(await materializeAdventureDerivedAssets({ ...f.input, materialization: withActTwo.input.materialization }))
      .toEqual({ [id]: { status: "available", path } });
    expect(f.storage.uploadAndConfirm).toHaveBeenCalledOnce();
  });

  it("classifies unknown lookup separately from a known crop failure", async () => {
    const f = fixture(["actOne", "actTwo"]);
    vi.mocked(f.storage.findExisting).mockRejectedValueOnce(new Error("browse failed"));
    expect(await materializeAdventureDerivedAssets(f.input)).toMatchObject({ [id]: { status: "failed", reason: "lookup" } });
    expect(f.images.crop).not.toHaveBeenCalled();
    vi.mocked(f.images.crop).mockRejectedValueOnce(new Error("decode failed"));
    expect(await materializeAdventureDerivedAssets(f.input)).toMatchObject({ [id]: { status: "failed", reason: "generation" } });
  });
});
