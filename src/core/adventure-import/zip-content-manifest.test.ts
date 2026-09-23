import { describe, expect, it } from "vitest";
import { buildZipContentManifestInput } from "./zip-content-manifest";

describe("ZIP content manifest", () => {
  it("uses ordinal logical paths, version and count without a trailing newline", () => {
    const entries = [
      { path: "Tokens/z.png", originalPath: "Root/Tokens/z.png", uncompressedSize: 2, crc32: 2 },
      { path: "Mapa/a.jpg", originalPath: "Root/Mapa/a.jpg", uncompressedSize: 1, crc32: 1 },
    ];
    const result = buildZipContentManifestInput(entries, new Map([
      ["Tokens/z.png", "b".repeat(64)], ["Mapa/a.jpg", "a".repeat(64)],
    ]));
    expect(result).toBe(`op2-zip-content-v1\n2\nMapa/a.jpg\t1\t${"a".repeat(64)}\nTokens/z.png\t2\t${"b".repeat(64)}`);
    expect(result.endsWith("\n")).toBe(false);
  });

  it("refuses to hash a manifest with a missing file SHA", () => {
    expect(() => buildZipContentManifestInput([
      { path: "a.png", originalPath: "a.png", uncompressedSize: 1, crc32: 1 },
    ], new Map())).toThrow(/Missing content SHA/);
  });
});
