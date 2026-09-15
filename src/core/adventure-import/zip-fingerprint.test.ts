import { describe, expect, it } from "vitest";

import { buildCanonicalZipFingerprintInput } from "./zip-fingerprint";
import type { ZipCentralDirectoryEntry } from "./zip-central-directory-entry";

function entry(path: string, uncompressedSize = 10, crc32 = 1): ZipCentralDirectoryEntry {
  return { path, uncompressedSize, crc32 };
}

describe("buildCanonicalZipFingerprintInput", () => {
  it("strips a common root folder shared by every file entry", () => {
    const withRoot = buildCanonicalZipFingerprintInput([
      entry("Pacote/Tokens/a.png"),
      entry("Pacote/Handouts/b.jpg"),
    ]);
    const withoutRoot = buildCanonicalZipFingerprintInput([
      entry("Tokens/a.png"),
      entry("Handouts/b.jpg"),
    ]);
    expect(withRoot).toBe(withoutRoot);
  });

  it("keeps full paths when entries do not share a single common root", () => {
    const result = buildCanonicalZipFingerprintInput([entry("Tokens/a.png"), entry("Handouts/b.jpg")]);
    expect(result).toContain("Tokens/a.png");
    expect(result).toContain("Handouts/b.jpg");
  });

  it("ignores directory entries entirely, for both root detection and content", () => {
    const withDirectoryEntries = buildCanonicalZipFingerprintInput([
      entry("Pacote/"),
      entry("Pacote/Tokens/"),
      entry("Pacote/Tokens/a.png"),
      entry("Pacote/Handouts/b.jpg"),
    ]);
    const withoutDirectoryEntries = buildCanonicalZipFingerprintInput([
      entry("Tokens/a.png"),
      entry("Handouts/b.jpg"),
    ]);
    expect(withDirectoryEntries).toBe(withoutDirectoryEntries);
  });

  it("does not treat a lone root-level directory entry as blocking root detection", () => {
    const result = buildCanonicalZipFingerprintInput([
      entry("Pacote/"),
      entry("Pacote/a.png"),
      entry("Pacote/b.png"),
    ]);
    expect(result).not.toContain("Pacote/");
    expect(result).toContain("a.png");
  });

  it("normalizes backslash separators before comparing or stripping the root", () => {
    const backslashes = buildCanonicalZipFingerprintInput([
      entry("Pacote\\Tokens\\a.png"),
      entry("Pacote\\Handouts\\b.jpg"),
    ]);
    const forwardSlashes = buildCanonicalZipFingerprintInput([
      entry("Pacote/Tokens/a.png"),
      entry("Pacote/Handouts/b.jpg"),
    ]);
    expect(backslashes).toBe(forwardSlashes);
  });

  it("is independent of the physical entry order in the archive", () => {
    const first = buildCanonicalZipFingerprintInput([entry("b.png", 2, 22), entry("a.png", 1, 11)]);
    const second = buildCanonicalZipFingerprintInput([entry("a.png", 1, 11), entry("b.png", 2, 22)]);
    expect(first).toBe(second);
  });

  it("includes size and CRC-32 in the canonical content, distinguishing same-name different-content entries", () => {
    const first = buildCanonicalZipFingerprintInput([entry("a.png", 100, 111)]);
    const second = buildCanonicalZipFingerprintInput([entry("a.png", 200, 222)]);
    expect(first).not.toBe(second);
  });
});
