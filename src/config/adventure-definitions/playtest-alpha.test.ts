import { describe, expect, it } from "vitest";
import { ZIP_PACKAGE_BY_ACT } from "../../core/adventure-import/known-adventure-sources";
import { safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";
import { PLAYTEST_ALPHA_ADVENTURE } from "./playtest-alpha";

describe("playtest alpha definition", () => {
  it("has unique semantic IDs and safe original entries for the two recognized ZIPs", () => {
    expect(PLAYTEST_ALPHA_ADVENTURE.packageIds).toEqual(ZIP_PACKAGE_BY_ACT);
    const ids = PLAYTEST_ALPHA_ADVENTURE.assets.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PLAYTEST_ALPHA_ADVENTURE.assets.some((asset) => asset.source.act === "actOne")).toBe(true);
    expect(PLAYTEST_ALPHA_ADVENTURE.assets.some((asset) => asset.source.act === "actTwo")).toBe(true);
    for (const asset of PLAYTEST_ALPHA_ADVENTURE.assets) {
      expect(safeZipEntryPath(asset.source.originalEntryPath).isDirectory).toBe(false);
      expect(asset.label).not.toBe("");
    }
    expect(PLAYTEST_ALPHA_ADVENTURE.assets.find((asset) => asset.id === "actOne.handout.06")?.source.originalEntryPath)
      .toBe("Arquivos para o público - Ato I/Handouts/Handout 06 - Estante de Livros.jpg");
    expect(PLAYTEST_ALPHA_ADVENTURE.assets.some((asset) => asset.source.originalEntryPath.includes("Audio EMF")))
      .toBe(false);
  });
});
