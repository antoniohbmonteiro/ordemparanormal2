import { describe, expect, it } from "vitest";

import type { KnownZipPackage, ZipPackageId } from "./known-adventure-sources";
import { recognizeZipSource } from "./recognize-zip-source";
import type { ZipCentralDirectoryEntry } from "./zip-central-directory-entry";

const KNOWN_PACKAGES: Record<ZipPackageId, KnownZipPackage> = {
  "ato-i-extras": { fingerprintHash: "hash-act-1" },
  "ato-ii-extras": { fingerprintHash: "hash-act-2" },
};

function entry(path: string, uncompressedSize = 10, crc32 = 1): ZipCentralDirectoryEntry {
  return { path, uncompressedSize, crc32 };
}

describe("recognizeZipSource", () => {
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
