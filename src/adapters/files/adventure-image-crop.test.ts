import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYTEST_ALPHA_ADVENTURE } from "../../config/adventure-definitions/playtest-alpha";
import { createAdventureImageCropPort } from "./adventure-image-crop";

const recipe = PLAYTEST_ALPHA_ADVENTURE.imageCrops[0];
const fetchResource = vi.fn(async () => new Blob(["synthetic"]));
const close = vi.fn();
const drawImage = vi.fn();
const bitmap = { width: 3537, height: 4101, close };
const createBitmap = vi.fn(async () => bitmap);
const toBlob = vi.fn((callback: (blob: Blob | null) => void) => callback(new Blob(["synthetic"], { type: "image/png" })));
const canvas = { width: 0, height: 0, getContext: vi.fn<() => { drawImage: typeof drawImage } | null>(() => ({ drawImage })), toBlob };

beforeEach(() => {
  vi.stubGlobal("foundry", { utils: { fetchResource } });
  vi.stubGlobal("createImageBitmap", createBitmap);
  vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
  canvas.width = 0; canvas.height = 0;
  fetchResource.mockClear(); createBitmap.mockClear(); close.mockClear(); drawImage.mockClear(); toBlob.mockClear(); canvas.getContext.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("browser image crop adapter", () => {
  it("fetches the materialized map and cuts exactly 200×440 pixels", async () => {
    const result = await createAdventureImageCropPort().crop("worlds/test/act-2/map.jpg", recipe);
    expect(fetchResource).toHaveBeenCalledExactlyOnceWith("worlds/test/act-2/map.jpg");
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(bitmap, 2486, 1815, 200, 440, 0, 0, 200, 440);
    expect(canvas).toMatchObject({ width: 200, height: 440 });
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(result.type).toBe("image/png");
    expect(close).toHaveBeenCalledOnce();
  });

  it("inspects a stored output and closes both valid and invalid bitmaps", async () => {
    const port = createAdventureImageCropPort();
    createBitmap.mockResolvedValueOnce({ width: 200, height: 440, close });
    expect(await port.inspect("stored.png", 200, 440)).toBe("valid");
    createBitmap.mockResolvedValueOnce({ width: 201, height: 440, close });
    expect(await port.inspect("stored.png", 200, 440)).toBe("invalid");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("distinguishes corrupt image data from an indeterminate decode failure", async () => {
    const port = createAdventureImageCropPort();
    createBitmap.mockRejectedValueOnce(new DOMException("bad image", "InvalidStateError"));
    expect(await port.inspect("stored.png", 200, 440)).toBe("invalid");
    createBitmap.mockRejectedValueOnce(new Error("decoder unavailable"));
    await expect(port.inspect("stored.png", 200, 440)).rejects.toThrow("decoder unavailable");
  });

  it("rejects out-of-bounds crops and serialization failures", async () => {
    createBitmap.mockResolvedValueOnce({ width: 2600, height: 2100, close });
    await expect(createAdventureImageCropPort().crop("small.jpg", recipe)).rejects.toThrow("limites");
    expect(close).toHaveBeenCalledOnce();
    canvas.getContext.mockReturnValueOnce(null);
    await expect(createAdventureImageCropPort().crop("map.jpg", recipe)).rejects.toThrow("Canvas 2D");
    toBlob.mockImplementationOnce(callback => callback(null));
    await expect(createAdventureImageCropPort().crop("map.jpg", recipe)).rejects.toThrow("serializar");
    expect(close).toHaveBeenCalledTimes(3);
  });
});
