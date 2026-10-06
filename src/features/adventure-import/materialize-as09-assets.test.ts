import { beforeEach, describe, expect, it, vi } from "vitest";
import { AS09_IMAGES } from "../../config/adventure-definitions/playtest-alpha-as09";
import { syntheticAs09File } from "./as09-test-fixtures";
import { as09PoiImages, materializeAs09Assets, As09MaterializationError } from "./materialize-as09-assets";
import * as zip from "../../adapters/files/open-zip-archive";

vi.mock("./analyze-as09-source", async original => ({
  ...await original<typeof import("./analyze-as09-source")>(), analyzeAs09Source: vi.fn(async () => ({ status: "recognized" })),
}));
vi.mock("../../config/adventure-definitions/playtest-alpha-as09", async original => {
  const actual = await original<typeof import("../../config/adventure-definitions/playtest-alpha-as09")>();
  const { syntheticImages } = await import("./as09-test-fixtures");
  return { ...actual, AS09_IMAGES: syntheticImages(actual.AS09_IMAGES) };
});
function ports() {
  const stored = new Map<string, File>();
  const storage = { worldId: "test", ensureDirectories: vi.fn(async () => {}),
    findExisting: vi.fn(async (directory: string, basename: string) => stored.has(`${directory}/${basename}`) ? `${directory}/${basename}` : null),
    uploadAndConfirm: vi.fn(async (directory: string, file: File) => { const path = `${directory}/${file.name}`; stored.set(path, file); return path; }),
  };
  const images = { convert: vi.fn(async (blob: Blob) => new Blob([blob], { type: "image/png" })), inspect: vi.fn(async () => true) };
  return { stored, storage, images };
}
beforeEach(() => vi.restoreAllMocks());
describe("AS09 materialization", () => {
  it("stores 39 images once, preserves JPG/PNG bytes and variants, converts nine TIFs, and shares POI paths", async () => {
    const p = ports(); const file = await syntheticAs09File();
    const result = await materializeAs09Assets({ ...p, file, isAuthorized: () => true });
    expect(result.assets).toHaveLength(39); expect(p.stored.size).toBe(39); expect(p.images.convert).toHaveBeenCalledTimes(9);
    expect([...p.stored.values()].filter(file => file.type === "image/jpeg")).toHaveLength(18);
    expect([...p.stored.values()].filter(file => file.type === "image/png")).toHaveLength(21);
    expect([...p.stored.keys()].every(path => !/\.(tif|psd|bin)$/.test(path))).toBe(true);
    expect([...p.stored.values()].map(file => file.name)).toEqual(expect.arrayContaining(["ESTEANTE_ABERTA_1.jpg", "ESTEANTE_ABERTAz.jpg", "SALA_AB.jpg", "SALA_AB_1.jpg"]));
    const pois = as09PoiImages(result);
    expect(pois.get("actOne.map.06")).toBe(pois.get("actTwo.map.08"));
    expect(pois.get("actOne.map.11")).toBeUndefined();
    expect(pois.get("actTwo.map.25")).toBeUndefined();
    const first = [...p.stored.values()][0];
    expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([1, 45, 67, 89]);
    await materializeAs09Assets({ ...p, file, isAuthorized: () => true });
    expect(p.storage.uploadAndConfirm).toHaveBeenCalledTimes(39);
    expect(p.images.convert).toHaveBeenCalledTimes(9);
  });
  it("reports a conversion failure and reuses confirmed files when retrying", async () => {
    const p = ports(); const file = await syntheticAs09File();
    p.images.convert.mockRejectedValueOnce(new Error("conversion"));
    const error = await materializeAs09Assets({ ...p, file, isAuthorized: () => true }).catch(error => error);
    expect(error).toBeInstanceOf(As09MaterializationError);
    expect(error).toMatchObject({ stage: "convert", asset: "CÂMERA MODIFICADA.tif", confirmedAssets: expect.any(Array) });
    expect(error.confirmedAssets).toHaveLength(2);
    expect(() => as09PoiImages({ directory: "test", assets: error.confirmedAssets })).toThrow("incompleta");
    await materializeAs09Assets({ ...p, file, isAuthorized: () => true });
    expect(p.storage.uploadAndConfirm).toHaveBeenCalledTimes(39);
  });
  it("verifies manual image bytes before upload and closes the archive after failure", async () => {
    const original = zip.openZipArchive; const closed = vi.fn();
    vi.spyOn(zip, "openZipArchive").mockImplementation(async file => {
      const archive = await original(file);
      return { entries: archive.entries.map(entry => ({ ...entry, extract: async () => entry.path.endsWith("/POSTER1.jpg")
        ? new Blob([Uint8Array.of(0, 45, 67, 89)]) : entry.extract() })),
      close: async () => { closed(); await archive.close(); } };
    });
    const p = ports();
    await expect(materializeAs09Assets({ ...p, file: await syntheticAs09File(), isAuthorized: () => true })).rejects.toMatchObject({ stage: "extract", asset: "POSTER1.jpg" });
    expect([...p.stored.keys()].some(path => path.endsWith("POSTER1.jpg"))).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });
  it("regenerates a converted PNG with invalid dimensions", async () => {
    const p = ports(); const file = await syntheticAs09File();
    await materializeAs09Assets({ ...p, file, isAuthorized: () => true });
    p.images.inspect.mockResolvedValueOnce(false);
    await materializeAs09Assets({ ...p, file, isAuthorized: () => true });
    expect(p.storage.uploadAndConfirm).toHaveBeenCalledTimes(40);
  });
  it("checks authorization before writes and stops after authority changes", async () => {
    const p = ports(); const file = await syntheticAs09File();
    await expect(materializeAs09Assets({ ...p, file, isAuthorized: () => false })).rejects.toMatchObject({ stage: "preflight", confirmedAssets: [] });
    expect(p.storage.ensureDirectories).not.toHaveBeenCalled();
    let authorized = true;
    await expect(materializeAs09Assets({ ...p, file, isAuthorized: () => authorized,
      onProgress: completed => { if (completed === 1) authorized = false; },
    })).rejects.toMatchObject({ confirmedAssets: [{ basename: AS09_IMAGES[0].basename }] });
  });
});
