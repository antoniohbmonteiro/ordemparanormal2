import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AS09_IMAGES, AS09_IMAGE_ROOT, AS09_POI_IMAGES, AS09_TOOLS } from "./playtest-alpha-as09";
import { safeZipEntryPath, assertDistinctZipPaths } from "../../core/adventure-import/safe-zip-entry-path";

describe("AS09 technical catalog", () => {
  it("covers every usable v1.0 image, with separate duplicate variants and no source files", () => {
    expect(AS09_IMAGES).toHaveLength(39);
    expect(AS09_IMAGES.filter(image => image.basename.endsWith(".jpg"))).toHaveLength(18);
    expect(AS09_IMAGES.filter(image => image.basename.endsWith(".png"))).toHaveLength(12);
    expect(AS09_IMAGES.filter(image => image.convertTiff)).toHaveLength(9);
    expect(AS09_IMAGES.reduce((sum, image) => sum + image.uncompressedSize, 0)).toBe(440143034);
    expect(AS09_IMAGES.every(image => image.path.startsWith(AS09_IMAGE_ROOT) && /^[a-f0-9]{64}$/.test(image.contentSha256))).toBe(true);
    expect(() => assertDistinctZipPaths(AS09_IMAGES.map(image => safeZipEntryPath(image.outputBasename)))).not.toThrow();
    expect(AS09_IMAGES.map(image => image.basename)).toEqual(expect.arrayContaining([
      "ESTEANTE_ABERTA_1.jpg", "ESTEANTE_ABERTAz.jpg", "SALA_AB.jpg", "SALA_AB_1.jpg", "POSTER1.jpg", "Low Alan.png", "Fundo.jpg", "Mockup Compendio.png",
    ]));
    expect(AS09_IMAGES.some(image => image.basename.endsWith(".psd"))).toBe(false);
  });
  it("limits automatic consumers to eight POI assets and nine canonical Equipment sources", async () => {
    expect(new Set(Object.values(AS09_POI_IMAGES)).size).toBe(8);
    expect(Object.keys(AS09_POI_IMAGES)).toHaveLength(13);
    expect(AS09_POI_IMAGES["actOne.map.24"]).toBe("Gustavo Freezer.png");
    expect(AS09_POI_IMAGES["actTwo.map.25"]).toBeUndefined();
    expect(AS09_POI_IMAGES["actOne.map.11"]).toBeUndefined();
    expect(AS09_TOOLS).toHaveLength(9);
    const packs = await Promise.all(AS09_TOOLS.map(async tool => {
      const names = ["camera-modificada", "laboratorio-portatil", "lanterna-de-estouro-ultravioleta", "laser-de-varredura",
        "leitor-infravermelho", "medidor-emf", "po-revelador", "radio-modificado", "termometro-diferencial"];
      const index = AS09_TOOLS.indexOf(tool);
      return JSON.parse(await readFile(new URL(`../../../packs-src/equipment/${names[index]}.json`, import.meta.url), "utf8")) as { _id: string; type: string };
    }));
    for (const [index, tool] of AS09_TOOLS.entries()) {
      expect(packs[index]).toMatchObject({ _id: tool.sourceId, type: "equipment" });
      expect(tool.sourceUuid).toBe(`Compendium.ordemparanormal2.equipment.Item.${tool.sourceId}`);
      expect(AS09_IMAGES.find(image => image.basename === tool.basename)?.convertTiff).toBe(true);
    }
  });
});
