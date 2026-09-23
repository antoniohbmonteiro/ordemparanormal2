import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";

const fixtures = vi.hoisted(() => ({
  readPdfParsedFacts: vi.fn(),
  pdf: {
    "playtest-alpha-v1.0": { edition: "playtest-alpha-v1.0", variant: "agents", supportedActs: ["actOne", "actTwo"],
      sha256Hashes: [] as string[], structural: {
      pageCount: 103, versionStampPattern: /v1\.0\b/ }, contentSignatureSha256: "content-test" },
    "playtest-alpha-v1.1": { edition: "playtest-alpha-v1.1", variant: "agents", supportedActs: ["actOne", "actTwo"],
      sha256Hashes: [] as string[], structural: {
      pageCount: 104, versionStampPattern: /v1\.1\b/ } },
  },
  zip: {
    "ato-i-extras": { fingerprintHashes: [] as string[] },
    "ato-ii-extras": { fingerprintHashes: [] as string[], structuralManifestHash: "",
      expectedFileCount: 0, anchors: [] as { path: string; uncompressedSize: number; crc32: number }[],
      identity: undefined as { structuralManifestHash: string; expectedFileCount: number; contentManifestHash: string } | undefined },
  },
}));
vi.mock("../../adapters/files/read-pdf-parsed-facts", () => ({ readPdfParsedFacts: fixtures.readPdfParsedFacts }));
vi.mock("../../core/adventure-import/known-adventure-sources", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../core/adventure-import/known-adventure-sources")>();
  return { ...original, KNOWN_PDF_EDITIONS: fixtures.pdf, KNOWN_ZIP_PACKAGES: fixtures.zip };
});

import { sha256Hex } from "../../adapters/files/compute-sha256";
import { buildCanonicalZipFingerprintInput } from "../../core/adventure-import/zip-fingerprint";
import { buildStructuralZipManifestInput, buildStructuralZipPayload } from "../../core/adventure-import/zip-structural-manifest";
import { buildZipContentManifestInput } from "../../core/adventure-import/zip-content-manifest";
import { readZipContentFacts } from "../../adapters/files/read-zip-content-facts";
import { openZipArchive } from "../../adapters/files/open-zip-archive";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import type { ZipCentralDirectoryEntry } from "../../core/adventure-import/zip-central-directory-entry";
import { analyzeAdventureSources } from "./analyze-adventure-sources";

async function zipFile(paths: readonly string[]): Promise<File> {
  const writer = new ZipWriter(new BlobWriter("application/zip"), { useWebWorkers: false });
  for (const path of paths) await writer.add(path, new BlobReader(new Blob([path])));
  return new File([await writer.close()], "synthetic.zip");
}

beforeEach(() => {
  fixtures.readPdfParsedFacts.mockReset().mockResolvedValue({ status: "success", facts: {
    pageCount: 103, producer: "Changed", creator: "Changed", lang: "en",
    versionStampTag: "Pacote #8 | Agosto/2026 | v1.0", contentSignatureSha256: "content-test",
  } });
  fixtures.zip["ato-i-extras"].fingerprintHashes = [];
  fixtures.zip["ato-ii-extras"].structuralManifestHash = "";
  fixtures.zip["ato-ii-extras"].expectedFileCount = 0;
  fixtures.zip["ato-ii-extras"].anchors = [];
  fixtures.zip["ato-ii-extras"].identity = undefined;
});

describe("analyzeAdventureSources integration", () => {
  it("composes semantic PDF, exact Ato I and structural Ato II recognition", async () => {
    const one = await zipFile(["Map/a.jpg"]);
    const two = await zipFile(["OtherRoot/Mapa/a.jpg", "OtherRoot/Tokens/b.png",
      "OtherRoot/Handouts/c.jpg", "__MACOSX/._a.jpg"]);
    const oneEntries = (await readZipCentralDirectory(one)).entries;
    const twoEntries = (await readZipCentralDirectory(two)).entries;
    fixtures.zip["ato-i-extras"].fingerprintHashes = [await sha256Hex(new TextEncoder().encode(
      buildCanonicalZipFingerprintInput(oneEntries)))];
    const payload = buildStructuralZipPayload(twoEntries);
    fixtures.zip["ato-ii-extras"].structuralManifestHash = await sha256Hex(new TextEncoder().encode(
      buildStructuralZipManifestInput(payload)));
    fixtures.zip["ato-ii-extras"].expectedFileCount = payload.length;
    fixtures.zip["ato-ii-extras"].anchors = payload.map(({ path, uncompressedSize, crc32 }) =>
      ({ path, uncompressedSize, crc32 }));
    const archive = await openZipArchive(two);
    try {
      const content = await readZipContentFacts(archive, twoEntries, payload);
      fixtures.zip["ato-ii-extras"].identity = {
        structuralManifestHash: fixtures.zip["ato-ii-extras"].structuralManifestHash,
        expectedFileCount: payload.length,
        contentManifestHash: await sha256Hex(new TextEncoder().encode(buildZipContentManifestInput(payload, content))),
      };
    } finally { await archive.close(); }

    const result = await analyzeAdventureSources({
      pdf: new File(["%PDF-1.7\n"], "synthetic.pdf"), actOne: one,
      actTwo: two, password: null,
    });
    expect(result.pdf).toMatchObject({ status: "recognized", matchMethod: "content", edition: "playtest-alpha-v1.0" });
    expect(fixtures.readPdfParsedFacts).toHaveBeenCalledWith(expect.any(ArrayBuffer), null,
      { includeContentSignature: true });
    expect(result.actOne).toMatchObject({ status: "recognized", matchMethod: "hash", edition: "ato-i-extras" });
    expect(result.actTwo).toMatchObject({ status: "recognized", matchMethod: "structural", edition: "ato-ii-extras" });
  });
});
