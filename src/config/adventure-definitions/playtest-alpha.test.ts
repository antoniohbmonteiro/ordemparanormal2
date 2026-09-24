import { PLAYTEST_ALPHA_AGENT_PRESETS } from "../adventure-agent-presets/playtest-alpha";
import { PLAYTEST_ALPHA_AGENT_SOURCES } from "../adventure-agent-sources/playtest-alpha";
import { describe, expect, it } from "vitest";
import { ZIP_PACKAGE_BY_ACT } from "../../core/adventure-import/known-adventure-sources";
import { safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";
import { PLAYTEST_ALPHA_ADVENTURE } from "./playtest-alpha";
import { validateHandoutDefinition } from "../../features/adventure-import/import-adventure-handouts";
import { validateAdventureAgentReferences } from "../../core/adventure-import/adventure-definition";

describe("playtest alpha definition", () => {
  it("declares ten unique preset references without duplicating the sheets", () => {
    expect(validateAdventureAgentReferences(PLAYTEST_ALPHA_ADVENTURE, PLAYTEST_ALPHA_AGENT_SOURCES,
      PLAYTEST_ALPHA_AGENT_PRESETS.map(p => p.key))).toEqual([]);
    expect(PLAYTEST_ALPHA_ADVENTURE.actors).toHaveLength(10);
    for (const actor of PLAYTEST_ALPHA_ADVENTURE.actors) expect(Object.keys(actor)).toEqual(["presetId"]);
  });
  it("rejects duplicate, unavailable and cross-Act references", () => {
    const actor = PLAYTEST_ALPHA_ADVENTURE.actors[0];
    const keys = PLAYTEST_ALPHA_AGENT_PRESETS.map(p => p.key);
    expect(validateAdventureAgentReferences({ ...PLAYTEST_ALPHA_ADVENTURE, actors: [actor, actor] }, PLAYTEST_ALPHA_AGENT_SOURCES, keys)).toContain(`Duplicate or empty preset reference: ${actor.presetId}`);
    expect(validateAdventureAgentReferences({ ...PLAYTEST_ALPHA_ADVENTURE, actors: [{ presetId: "missing" }] }, PLAYTEST_ALPHA_AGENT_SOURCES, keys)).toContain("Unknown preset: missing");
    const sources = PLAYTEST_ALPHA_AGENT_SOURCES.map(p => p.documentId === actor.presetId ? { ...p, tokenAssetId: "actTwo.val.token" } : p);
    expect(validateAdventureAgentReferences(PLAYTEST_ALPHA_ADVENTURE, sources, keys)).toContain(`Invalid token reference: ${actor.presetId}`);
  });
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

  it("maps every image and PDF handout to one explicit logical document", () => {
    expect(validateHandoutDefinition(PLAYTEST_ALPHA_ADVENTURE)).toEqual([]);
    expect(PLAYTEST_ALPHA_ADVENTURE.handouts).toHaveLength(26);
    expect(PLAYTEST_ALPHA_ADVENTURE.handouts.filter((handout) => handout.act === "actOne")).toHaveLength(18);
    expect(PLAYTEST_ALPHA_ADVENTURE.handouts.filter((handout) => handout.act === "actTwo")).toHaveLength(8);
    expect(PLAYTEST_ALPHA_ADVENTURE.handouts.filter((handout) => handout.pageType === "pdf")).toEqual([
      expect.objectContaining({ id: "actTwo.handout.01.print", assetId: "actTwo.handout.01.print" }),
      expect.objectContaining({ id: "actTwo.handout.01.fillable", assetId: "actTwo.handout.01.fillable" }),
    ]);
  });
});
