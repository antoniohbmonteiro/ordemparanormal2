import { describe, expect, it, vi } from "vitest";
import type { AdventureAssetLookup } from "../../adapters/foundry/adventure-asset-storage";
import type { AdventureDefinition } from "../../core/adventure-import/adventure-definition";
import type { MaterializationResult } from "./materialize-adventure-assets";
import {
  AssetResolutionError, resolveAdventureAsset, validateAdventureDefinition,
} from "./resolve-adventure-asset";

const definition: AdventureDefinition = {
  pointsOfInterest: [],
  scenes: [],
  id: "playtest-alpha",
  actors: [],
  packageIds: { actOne: "ato-i-extras", actTwo: "ato-ii-extras" },
  assets: [
    { id: "one.kenia.portrait", kind: "portrait", label: "Kênia", source: {
      act: "actOne", originalEntryPath: "Retratos/Personagem - Kênia.png",
    } },
    { id: "two.kenia.portrait", kind: "portrait", label: "Kênia", source: {
      act: "actTwo", originalEntryPath: "Retratos/Personagem - Kênia.png",
    } },
  ],
  handouts: [],
};

const stored = "worlds/test-world/act-1/Retratos/Personagem%20-%20K%C3%AAnia.png";
const result: MaterializationResult = {
  materializedActs: ["actOne"],
  assets: [{ act: "actOne", originalEntryPath: "Retratos/Personagem - Kênia.png", storedPath: stored }],
};

function lookup(): AdventureAssetLookup & { findExisting: ReturnType<typeof vi.fn> } {
  return { worldId: "test-world", findExisting: vi.fn().mockResolvedValue(stored) };
}

describe("adventure asset resolver", () => {
  it("resolves only from a complete result without browsing or crossing acts", async () => {
    const foundryLookup = lookup();
    expect(await resolveAdventureAsset(definition, "one.kenia.portrait", {
      kind: "materialization", result,
    })).toBe(stored);
    await expect(resolveAdventureAsset(definition, "two.kenia.portrait", {
      kind: "materialization", result,
    })).rejects.toMatchObject({ code: "out-of-scope" });
    await expect(resolveAdventureAsset(definition, "unknown", {
      kind: "materialization", result,
    })).rejects.toMatchObject({ code: "unknown-id" });
    expect(foundryLookup.findExisting).not.toHaveBeenCalled();
  });

  it("fails on a missing entry in-scope, without falling back to files from a failed attempt", async () => {
    const empty: MaterializationResult = { materializedActs: ["actOne", "actTwo"], assets: [] };
    await expect(resolveAdventureAsset(definition, "one.kenia.portrait", {
      kind: "materialization", result: empty,
    })).rejects.toMatchObject({ code: "missing-asset" });
    const partialProgress = { assets: result.assets } as MaterializationResult;
    await expect(resolveAdventureAsset(definition, "one.kenia.portrait", {
      kind: "materialization", result: partialProgress,
    })).rejects.toThrow(/requires explicit materializedActs/);
  });

  it("browses explicitly in worldStorage mode, regardless of an in-memory result", async () => {
    const foundryLookup = lookup();
    const source = { kind: "worldStorage" as const, lookup: foundryLookup };
    expect(result.assets).toHaveLength(1);
    expect(await resolveAdventureAsset(definition, "two.kenia.portrait", source)).toBe(stored);
    expect(foundryLookup.findExisting).toHaveBeenCalledExactlyOnceWith(
      "worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-2/Retratos",
      "Personagem - Kênia.png",
    );
  });

  it("distinguishes a missing stored file from a browse failure", async () => {
    const foundryLookup = lookup();
    foundryLookup.findExisting.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("permission denied"));
    const source = { kind: "worldStorage" as const, lookup: foundryLookup };
    await expect(resolveAdventureAsset(definition, "one.kenia.portrait", source))
      .rejects.toMatchObject({ code: "missing-asset" });
    await expect(resolveAdventureAsset(definition, "one.kenia.portrait", source))
      .rejects.toMatchObject({ code: "browse-failed" });
  });

  it("validates the explicit scope rather than deriving it from assets", async () => {
    const foundryLookup = lookup();
    const empty: MaterializationResult = { materializedActs: ["actOne"], assets: [] };
    expect(await validateAdventureDefinition(definition, {
      kind: "materialization", result: empty,
    }, ["actOne"])).toEqual([{ code: "missing-asset", assetId: "one.kenia.portrait" }]);
    expect(await validateAdventureDefinition(definition, {
      kind: "materialization", result: empty,
    }, ["actTwo"])).toEqual([{ code: "out-of-scope", assetId: "actTwo" }]);
    expect(foundryLookup.findExisting).not.toHaveBeenCalled();
    expect(await validateAdventureDefinition(definition, {
      kind: "worldStorage", lookup: foundryLookup,
    }, ["actTwo"])).toEqual([]);
    expect(foundryLookup.findExisting).toHaveBeenCalledOnce();
  });

  it("reports duplicate IDs, unsafe entries, and incompatible packages", async () => {
    const invalid: AdventureDefinition = {
      ...definition,
      packageIds: { actOne: "ato-ii-extras", actTwo: "ato-ii-extras" },
      assets: [
        definition.assets[0],
        { ...definition.assets[0], source: { act: "actOne", originalEntryPath: "../unsafe.png" } },
      ],
    };
    const issues = await validateAdventureDefinition(invalid, {
      kind: "materialization", result,
    }, ["actOne"]);
    expect(issues).toContainEqual({ code: "wrong-package", assetId: "actOne" });
    expect(issues).toContainEqual({ code: "duplicate-id", assetId: "one.kenia.portrait" });
    expect(issues).toContainEqual({ code: "invalid-reference", assetId: "one.kenia.portrait" });
  });
});
