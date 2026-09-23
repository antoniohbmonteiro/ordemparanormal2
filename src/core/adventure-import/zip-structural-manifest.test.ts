import { describe, expect, it } from "vitest";
import { buildCanonicalZipFingerprintInput } from "./zip-fingerprint";
import { buildStructuralZipManifestInput, buildStructuralZipPayload } from "./zip-structural-manifest";
import type { ZipCentralDirectoryEntry } from "./zip-central-directory-entry";

const entry = (path: string, uncompressedSize = 10, crc32 = 1): ZipCentralDirectoryEntry =>
  ({ path, uncompressedSize, crc32 });

describe("structural ZIP payload manifest", () => {
  const original = [entry("Bundle/"), entry("Bundle/Mapa/a.jpg", 100, 10),
    entry("Bundle/Tokens/b.png", 20, 20), entry("Bundle/Handouts/c.jpg", 30, 30)];

  it("keeps the legacy fingerprint unchanged for the known payload", () => {
    expect(buildCanonicalZipFingerprintInput(original)).toBe(buildCanonicalZipFingerprintInput([
      entry("Mapa/a.jpg", 100, 10), entry("Tokens/b.png", 20, 20), entry("Handouts/c.jpg", 30, 30),
    ]));
  });

  it("removes whitelisted noise before detecting a common root", () => {
    const repacked = [entry("__MACOSX/._a.jpg", 2, 4), entry("NewRoot/.DS_Store", 1, 3),
      entry("NewRoot/Handouts/c.jpg", 30, 30), entry("NewRoot/Tokens/b.png", 20, 20),
      entry("NewRoot/Mapa/a.jpg", 100, 10), entry("NewRoot/"), entry("NewRoot/Tokens/")];
    expect(buildStructuralZipManifestInput(buildStructuralZipPayload(repacked)))
      .toBe(buildStructuralZipManifestInput(buildStructuralZipPayload(original)));
    expect(buildCanonicalZipFingerprintInput(repacked)).not.toBe(buildCanonicalZipFingerprintInput(original));
    expect(buildStructuralZipPayload(repacked).map((item) => item.path))
      .toEqual(["Handouts/c.jpg", "Mapa/a.jpg", "Tokens/b.png"]);
  });

  it("requires the complete file inventory and all size/CRC values", () => {
    const expected = buildStructuralZipManifestInput(buildStructuralZipPayload(original));
    for (const changed of [
      original.slice(0, -1),
      [...original.slice(0, -1), entry("Bundle/Handouts/renamed.jpg", 30, 30)],
      [...original.slice(0, -1), entry("Bundle/Handouts/c.jpg", 30, 31)],
      [...original, entry("Bundle/unknown.txt", 1, 1)],
    ]) expect(buildStructuralZipManifestInput(buildStructuralZipPayload(changed))).not.toBe(expected);
  });

  it.each([
    [entry("../escape.png")],
    [entry("x/a.png"), entry("x\\a.png")],
    [entry("x/Café.png"), entry("x/Cafe\u0301.png")],
    [entry("x/A.png"), entry("x/a.png")],
    [entry("x/file"), entry("x/file/child.png")],
  ])("rejects unsafe or colliding paths before matching", (...entries) => {
    expect(() => buildStructuralZipPayload(entries)).toThrow();
  });
});
