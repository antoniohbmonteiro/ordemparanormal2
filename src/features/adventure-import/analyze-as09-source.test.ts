import { beforeEach, describe, expect, it, vi } from "vitest";
import { AS09_IMAGES } from "../../config/adventure-definitions/playtest-alpha-as09";
import { syntheticAs09File } from "./as09-test-fixtures";
import { sha256Hex } from "../../adapters/files/compute-sha256";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import * as zip from "../../adapters/files/open-zip-archive";
import { buildCanonicalZipFingerprintInput } from "../../core/adventure-import/zip-fingerprint";
import { buildStructuralZipPayload, buildStructuralZipManifestInput } from "../../core/adventure-import/zip-structural-manifest";
import { buildZipContentManifestInput } from "../../core/adventure-import/zip-content-manifest";
import { analyzeAs09Source } from "./analyze-as09-source";

const known = vi.hoisted(() => ({ fingerprintHash: "", structuralManifestHash: "", expectedFileCount: 88,
  expectedImageCount: 39, contentManifestHash: "" }));
vi.mock("../../core/adventure-import/known-adventure-sources", async original => ({
  ...await original<typeof import("../../core/adventure-import/known-adventure-sources")>(), KNOWN_AS09_PACKAGE: known,
}));
vi.mock("../../config/adventure-definitions/playtest-alpha-as09", async original => {
  const actual = await original<typeof import("../../config/adventure-definitions/playtest-alpha-as09")>();
  const { createHash } = await import("node:crypto");
  const bytes = (index: number) => Uint8Array.of(index + 1, 45, 67, 89);
  const crc32 = (data: Uint8Array) => {
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    return (crc ^ 0xffffffff) >>> 0;
  };
  return { ...actual, AS09_IMAGES: actual.AS09_IMAGES.map((image, i) => ({ ...image,
    uncompressedSize: 4, crc32: crc32(bytes(i)), contentSha256: createHash("sha256").update(bytes(i)).digest("hex"),
  })) };
});

let file: File;
beforeEach(async () => {
  vi.restoreAllMocks();
  file = await syntheticAs09File();
  const { entries } = await readZipCentralDirectory(file);
  const payload = buildStructuralZipPayload(entries);
  known.fingerprintHash = await sha256Hex(new TextEncoder().encode(buildCanonicalZipFingerprintInput(entries)));
  known.structuralManifestHash = await sha256Hex(new TextEncoder().encode(buildStructuralZipManifestInput(payload)));
  known.contentManifestHash = await sha256Hex(new TextEncoder().encode(buildZipContentManifestInput(
    payload.filter(entry => AS09_IMAGES.some(image => image.path === entry.path)), new Map(AS09_IMAGES.map(image => [image.path, image.contentSha256])),
  )));
});

describe("AS09 file analysis", () => {
  it("recognizes a renamed ZIP on the metadata fast path without opening or loading the whole archive", async () => {
    const open = vi.spyOn(zip, "openZipArchive");
    const wholeFile = vi.spyOn(file, "arrayBuffer");
    expect(await analyzeAs09Source(file)).toMatchObject({ status: "recognized", matchMethod: "hash" });
    expect(open).not.toHaveBeenCalled(); expect(wholeFile).not.toHaveBeenCalled();
  });
  it("uses structural fallback and extracts only the 39 images, not source files or unrelated payload", async () => {
    const original = zip.openZipArchive;
    const extracted: string[] = [];
    vi.spyOn(zip, "openZipArchive").mockImplementation(async input => {
      const archive = await original(input);
      return { ...archive, entries: archive.entries.map(entry => ({ ...entry, extract: async () => { extracted.push(entry.path); return entry.extract(); } })) };
    });
    expect(await analyzeAs09Source(await syntheticAs09File(true))).toMatchObject({ status: "recognized", matchMethod: "structural" });
    expect(extracted).toHaveLength(39);
    expect(extracted.sort()).toEqual(AS09_IMAGES.map(image => image.path).sort());
  });
  it.each(["POSTER1.jpg", "Low Alan.png", "Fundo.jpg", "Mockup Compendio.png", "ESTEANTE_ABERTAz.jpg", "SALA_AB_1.jpg"])("confirms the content of manually available %s too", async basename => {
    const original = zip.openZipArchive;
    vi.spyOn(zip, "openZipArchive").mockImplementation(async input => {
      const archive = await original(input);
      return { ...archive, entries: archive.entries.map(entry => ({ ...entry, extract: async () =>
        entry.path.endsWith(`/${basename}`) ? new Blob([Uint8Array.of(0, 45, 67, 89)]) : entry.extract(),
      })) };
    });
    expect(await analyzeAs09Source(await syntheticAs09File(true))).toMatchObject({ status: "unknown", issues: [{ code: "zip-content-mismatch" }] });
  });
  it("keeps invalid data isolated as an optional analysis failure", async () => {
    expect((await analyzeAs09Source(new File(["not a zip"], "AS09.zip"))).status).toBe("invalid");
  });
});
