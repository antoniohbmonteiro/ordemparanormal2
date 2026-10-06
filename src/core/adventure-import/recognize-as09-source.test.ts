import { describe, expect, it } from "vitest";
import { KNOWN_AS09_PACKAGE } from "./known-adventure-sources";
import { recognizeAs09Source } from "./recognize-as09-source";

const signature = { fileCount: 88, imageCount: 39, manifestHash: KNOWN_AS09_PACKAGE.structuralManifestHash };
const entries = [{ path: "Presentinho/ALTAR.jpg", uncompressedSize: 1, crc32: 1 }];
describe("AS09 recognition", () => {
  it("accepts the metadata fast path without a content signature or Act identity", () => {
    expect(recognizeAs09Source(entries, KNOWN_AS09_PACKAGE.fingerprintHash, signature)).toEqual({ status: "recognized", matchMethod: "hash", issues: [] });
  });
  it("requires all 39 consumed images in the structural content signature", () => {
    expect(recognizeAs09Source(entries, "miss", { ...signature, contentManifestHash: KNOWN_AS09_PACKAGE.contentManifestHash }).status).toBe("recognized");
    for (const changed of [{ ...signature }, { ...signature, imageCount: 21, contentManifestHash: KNOWN_AS09_PACKAGE.contentManifestHash },
      { ...signature, contentManifestHash: "changed" }, { ...signature, fileCount: 87, contentManifestHash: KNOWN_AS09_PACKAGE.contentManifestHash }])
      expect(recognizeAs09Source(entries, "miss", changed).status).toBe("unknown");
  });
  it.each(["../bad.jpg", "safe/../bad.jpg", "C:/bad.jpg"])("validates %s before accepting a known fingerprint", path => {
    expect(recognizeAs09Source([{ ...entries[0], path }], KNOWN_AS09_PACKAGE.fingerprintHash, signature).status).toBe("invalid");
  });
  it("rejects colliding raw paths and adapter errors", () => {
    expect(recognizeAs09Source([...entries, entries[0]], KNOWN_AS09_PACKAGE.fingerprintHash, signature).status).toBe("invalid");
    expect(recognizeAs09Source(entries, KNOWN_AS09_PACKAGE.fingerprintHash, signature, [{ code: "zip-encrypted-entries-unsupported", severity: "error" }]).status).toBe("invalid");
  });
});
