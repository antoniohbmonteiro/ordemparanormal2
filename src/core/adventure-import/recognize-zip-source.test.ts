import { describe, expect, it } from "vitest";

import { KNOWN_ZIP_PACKAGES, type KnownZipPackage, type ZipPackageId } from "./known-adventure-sources";
import { recognizeZipSource } from "./recognize-zip-source";
import type { ZipCentralDirectoryEntry } from "./zip-central-directory-entry";

const KNOWN_PACKAGES: Record<ZipPackageId, KnownZipPackage> = {
  "ato-i-extras": { fingerprintHashes: ["hash-act-1"] },
  "ato-ii-extras": { fingerprintHashes: ["hash-act-2"] },
};

function entry(path: string, uncompressedSize = 10, crc32 = 1): ZipCentralDirectoryEntry {
  return { path, uncompressedSize, crc32 };
}

describe("recognizeZipSource", () => {
  const payload = [entry("Mapa/a.jpg", 100, 10), entry("Tokens/b.png", 20, 20), entry("Handouts/c.jpg", 30, 30)]
    .map((item) => ({ ...item, originalPath: item.path }));
  const structuralPackages: Record<ZipPackageId, KnownZipPackage> = {
    "ato-i-extras": { fingerprintHashes: ["exact-one"] },
    "ato-ii-extras": { fingerprintHashes: ["exact-two"], structuralManifestHash: "manifest-two",
      expectedFileCount: 3, anchors: [payload[0], payload[1], payload[2]],
      identity: { structuralManifestHash: "manifest-two", expectedFileCount: 3, contentManifestHash: "content-two" } },
  };

  it("recognizes a structural manifest after an exact miss and detects the wrong act slot", () => {
    const signature = { manifestHash: "manifest-two", fileCount: 3, entries: payload,
      identityManifestHashes: { "ato-ii-extras": "manifest-two" }, contentManifestHash: "content-two" };
    expect(recognizeZipSource(payload, "miss", "actTwo", structuralPackages, [], signature))
      .toMatchObject({ status: "recognized", matchMethod: "structural", edition: "ato-ii-extras" });
    expect(recognizeZipSource(payload, "miss", "actOne", structuralPackages, [], signature))
      .toMatchObject({ status: "unsupported", matchMethod: "structural", edition: "ato-ii-extras",
        issues: [{ code: "zip-wrong-act-slot" }] });
  });

  it("requires manifest, count and every anchor, while exact hashes stay first", () => {
    const signature = { manifestHash: "manifest-two", fileCount: 3, entries: payload,
      identityManifestHashes: { "ato-ii-extras": "manifest-two" }, contentManifestHash: "content-two" };
    expect(recognizeZipSource(payload, "exact-two", "actTwo", structuralPackages, [], signature).matchMethod).toBe("hash");
    expect(recognizeZipSource(payload, "miss", "actTwo", structuralPackages, [],
      { ...signature, manifestHash: "wrong" }).status).toBe("unknown");
    expect(recognizeZipSource(payload, "miss", "actTwo", structuralPackages, [],
      { ...signature, fileCount: 2 }).status).toBe("unknown");
    expect(recognizeZipSource(payload, "miss", "actTwo", structuralPackages, [],
      { ...signature, entries: payload.map((item) => item.path === "Mapa/a.jpg" ? { ...item, crc32: 999 } : item) })
      .status).toBe("unknown");
  });

  it("accepts only measured supplemental omissions after the required content hash matches", () => {
    const supplements = [entry("Handouts/Audio EMF 1.mp3", 101, 11),
      entry("Handouts/Audio EMF 2.mp3", 102, 12), entry("Handouts/Audio EMF 3.mp3", 103, 13)]
      .map((item) => ({ ...item, originalPath: item.path }));
    const pkg: KnownZipPackage = {
      fingerprintHashes: [], structuralManifestHash: "full", expectedFileCount: 6,
      anchors: [payload[0], payload[1], payload[2]],
      identity: { structuralManifestHash: "required", expectedFileCount: 3, contentManifestHash: "content-required" },
      requiredPaths: payload.map((entry) => entry.path),
      supplemental: supplements.map((entry, index) => ({ ...entry, contentSha256: `sha-${index}` })),
    };
    const packages = { ...structuralPackages, "ato-ii-extras": pkg };
    const signature = (extra: readonly typeof payload[number][], sha = "content-required") => ({
      manifestHash: extra.length === 3 ? "full" : "partial", fileCount: payload.length + extra.length,
      entries: [...payload, ...extra], identityManifestHashes: { "ato-ii-extras": "required" },
      contentManifestHash: sha, contentShaByPath: new Map(extra.map((entry, index) => [entry.path, `sha-${index}`])),
    });
    expect(recognizeZipSource(payload, "miss", "actTwo", packages, [], signature(supplements)))
      .toMatchObject({ status: "recognized", missingSupplementalPaths: [] });
    expect(recognizeZipSource(payload, "miss", "actTwo", packages, [], signature([])))
      .toMatchObject({ status: "recognized", matchMethod: "structural", missingSupplementalPaths: [
        "Handouts/Audio EMF 1.mp3", "Handouts/Audio EMF 2.mp3", "Handouts/Audio EMF 3.mp3",
      ] });
    expect(recognizeZipSource(payload, "miss", "actTwo", packages, [], signature(supplements.slice(0, 1))))
      .toMatchObject({ status: "recognized", missingSupplementalPaths: [
        "Handouts/Audio EMF 2.mp3", "Handouts/Audio EMF 3.mp3",
      ] });
    expect(recognizeZipSource(payload, "miss", "actTwo", packages, [], {
      ...signature(supplements.slice(0, 1)),
      contentShaByPath: new Map([[supplements[0].path, "changed-bytes"]]),
    })).toMatchObject({ status: "unknown", issues: [{ code: "zip-supplemental-mismatch" }] });
    expect(recognizeZipSource(payload, "miss", "actTwo", packages, [], signature([], "wrong")))
      .toMatchObject({ status: "unknown", issues: [{ code: "zip-content-mismatch" }] });
    expect(recognizeZipSource(payload, "miss", "actTwo", packages, [], signature([
      { ...supplements[0], crc32: 999 },
    ]))).toMatchObject({ status: "unknown", issues: [{ code: "zip-supplemental-mismatch" }] });
    expect(recognizeZipSource(payload, "miss", "actTwo", packages, [], signature([
      { ...entry("Unknown/new.png"), originalPath: "Unknown/new.png" },
    ]))).toMatchObject({ status: "unknown", issues: [{ code: "zip-unexpected-payload" }] });
    expect(recognizeZipSource(payload, "miss", "actTwo", packages, [], {
      ...signature([]), entries: payload.slice(1), fileCount: 2,
    })).toMatchObject({ status: "unknown", issues: [{ code: "zip-required-mismatch" }] });
  });

  it("validates raw paths before accepting a known hash", () => {
    expect(recognizeZipSource([entry("../escape.png")], "exact-two", "actTwo", structuralPackages))
      .toMatchObject({ status: "invalid", matchMethod: "none", issues: [{ code: "zip-invalid-entries" }] });
  });

  it.each([
    ["actOne", "ato-i-extras", "0fbb4e2b4d1e0f4db5a4ecd9adc2fae8cb5d4dae0f30624e404a525eaddbff3b"],
    ["actTwo", "ato-ii-extras", "97793e51f2faec236f830787ac8ea0c53627e4f87ed844de4ef3aaa781d696ff"],
    ["actTwo", "ato-ii-extras", "ed97c8afedd5b1dc3c0dd2bd64f27a55dcfb07cc07ffa3841b45e3e52be32d48"],
  ] as const)("recognizes the registered %s fingerprint %s (%s)", (act, edition, fingerprint) => {
    const result = recognizeZipSource([entry("a.png")], fingerprint, act, KNOWN_ZIP_PACKAGES);
    expect(result).toMatchObject({ status: "recognized", matchMethod: "hash", edition });
  });

  it.each(KNOWN_ZIP_PACKAGES["ato-ii-extras"].fingerprintHashes)(
    "flags Ato II fingerprint %s in the Ato I slot",
    (fingerprint) => {
      const result = recognizeZipSource([entry("a.png")], fingerprint, "actOne", KNOWN_ZIP_PACKAGES);
      expect(result).toMatchObject({ status: "unsupported", matchMethod: "hash", edition: "ato-ii-extras" });
      expect(result.issues).toContainEqual({ code: "zip-wrong-act-slot", severity: "warning" });
    },
  );

  it("flags the Ato I fingerprint in the Ato II slot", () => {
    const result = recognizeZipSource([entry("a.png")], KNOWN_ZIP_PACKAGES["ato-i-extras"].fingerprintHashes[0], "actTwo", KNOWN_ZIP_PACKAGES);
    expect(result).toMatchObject({ status: "unsupported", matchMethod: "hash", edition: "ato-i-extras" });
    expect(result.issues).toContainEqual({ code: "zip-wrong-act-slot", severity: "warning" });
  });

  it("keeps an unknown fingerprint unknown regardless of the file inventory", () => {
    const result = recognizeZipSource([entry("Arquivos para o publico - Ato II/Tokens/a.png")], "unknown-fingerprint", "actTwo", KNOWN_ZIP_PACKAGES);
    expect(result).toMatchObject({ status: "unknown", matchMethod: "none", edition: null });
  });

  it("returns invalid with a null inventory when the adapter reports an error issue", () => {
    const result = recognizeZipSource([], "irrelevant", "actOne", KNOWN_PACKAGES, [
      { code: "zip-eocd-not-found", severity: "error" },
    ]);
    expect(result.status).toBe("invalid");
    expect(result.inventory).toBeNull();
  });

  it("recognizes a ZIP whose fingerprint matches the known package for that act", () => {
    const result = recognizeZipSource([entry("a.png")], "hash-act-1", "actOne", KNOWN_PACKAGES);
    expect(result).toMatchObject({ status: "recognized", matchMethod: "hash", edition: "ato-i-extras" });
  });

  it("flags a ZIP as unsupported when its fingerprint matches the OTHER act's known package exactly", () => {
    const result = recognizeZipSource([entry("a.png")], "hash-act-2", "actOne", KNOWN_PACKAGES);
    expect(result).toMatchObject({ status: "unsupported", matchMethod: "hash", edition: "ato-ii-extras" });
    expect(result.issues).toContainEqual({ code: "zip-wrong-act-slot", severity: "warning" });
  });

  it("returns unknown when the fingerprint matches neither known package", () => {
    const result = recognizeZipSource([entry("a.png")], "hash-neither", "actOne", KNOWN_PACKAGES);
    expect(result).toMatchObject({ status: "unknown", matchMethod: "none", edition: null });
  });

  it("builds an inventory from file entries only, with a common root stripped", () => {
    const result = recognizeZipSource(
      [
        entry("Pacote/"),
        entry("Pacote/Tokens/a.png"),
        entry("Pacote/Tokens/b.png"),
        entry("Pacote/Handouts/c.jpg", 100),
      ],
      "hash-act-1",
      "actOne",
      KNOWN_PACKAGES,
    );
    expect(result.inventory).toEqual({
      totalFiles: 3,
      totalBytes: 120,
      topLevelFolders: [
        { name: "Tokens", fileCount: 2 },
        { name: "Handouts", fileCount: 1 },
      ],
    });
  });

  it("keeps a null inventory only for the invalid case, even when status is unknown", () => {
    const result = recognizeZipSource([entry("a.png")], "hash-neither", "actOne", KNOWN_PACKAGES);
    expect(result.inventory).not.toBeNull();
  });
});
