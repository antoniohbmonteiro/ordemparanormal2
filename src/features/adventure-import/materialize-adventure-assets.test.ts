import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hashes: {
    "ato-i-extras": { fingerprintHashes: [""], logicalRootPrefix: undefined as string | undefined,
      structuralManifestHash: undefined as string | undefined, expectedFileCount: undefined as number | undefined,
      anchors: undefined as readonly { path: string; uncompressedSize: number; crc32: number }[] | undefined,
      identity: undefined as { structuralManifestHash: string; expectedFileCount: number; contentManifestHash: string } | undefined,
      supplemental: undefined as readonly { path: string; uncompressedSize: number; crc32: number; contentSha256: string }[] | undefined },
    "ato-ii-extras": { fingerprintHashes: [""], logicalRootPrefix: undefined as string | undefined,
      structuralManifestHash: undefined as string | undefined, expectedFileCount: undefined as number | undefined,
      anchors: undefined as readonly { path: string; uncompressedSize: number; crc32: number }[] | undefined,
      identity: undefined as { structuralManifestHash: string; expectedFileCount: number; contentManifestHash: string } | undefined,
      supplemental: undefined as readonly { path: string; uncompressedSize: number; crc32: number; contentSha256: string }[] | undefined },
  },
  openZipArchive: vi.fn(),
}));
vi.mock("../../core/adventure-import/known-adventure-sources", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../core/adventure-import/known-adventure-sources")>();
  return { ...original, KNOWN_ZIP_PACKAGES: mocks.hashes };
});
vi.mock("../../adapters/files/open-zip-archive", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../adapters/files/open-zip-archive")>();
  return { ...original, openZipArchive: mocks.openZipArchive };
});

import { sha256Hex } from "../../adapters/files/compute-sha256";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import type { AdventureAssetStorage } from "../../adapters/foundry/adventure-asset-storage";
import { buildCanonicalZipFingerprintInput } from "../../core/adventure-import/zip-fingerprint";
import { buildStructuralZipManifestInput, buildStructuralZipPayload } from "../../core/adventure-import/zip-structural-manifest";
import { buildZipContentManifestInput } from "../../core/adventure-import/zip-content-manifest";
import { readZipContentFacts } from "../../adapters/files/read-zip-content-facts";
import type { ZipSourceAnalysis } from "../../core/adventure-import/recognize-zip-source";
import type { PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import { analyzeZipActSource } from "./analyze-adventure-sources";
import { materializeAdventureAssets, MaterializationError } from "./materialize-adventure-assets";

async function zipFile(entries: readonly [string, string][]): Promise<File> {
  const writer = new ZipWriter(new BlobWriter("application/zip"), { useWebWorkers: false });
  for (const [path, content] of entries) {
    await writer.add(path, new BlobReader(new Blob([content])));
  }
  const blob = await writer.close();
  return new File([blob], "synthetic.zip", { type: "application/zip" });
}

async function recognizeForTest(file: File, act: "actOne" | "actTwo"): Promise<ZipSourceAnalysis> {
  const { entries } = await readZipCentralDirectory(file);
  const hash = await sha256Hex(new TextEncoder().encode(buildCanonicalZipFingerprintInput(entries)));
  mocks.hashes[act === "actOne" ? "ato-i-extras" : "ato-ii-extras"].fingerprintHashes = [hash];
  return {
    act, status: "recognized", matchMethod: "hash",
    edition: act === "actOne" ? "ato-i-extras" : "ato-ii-extras", inventory: null, issues: [],
  };
}

function storage(): AdventureAssetStorage & { uploads: { directory: string; file: File }[]; created: string[][] } {
  const uploads: { directory: string; file: File }[] = [];
  const created: string[][] = [];
  return {
    worldId: "test-world", uploads, created,
    async findExisting() { return null; },
    async ensureDirectories(dirs) { created.push([...dirs]); },
    async uploadAndConfirm(directory, file) {
      uploads.push({ directory, file });
      return `${directory}/${file.name}`;
    },
  };
}

const MIME = { png: "image/png", jpg: "image/jpeg", mp3: "audio/mpeg", pdf: "application/pdf" };
const PDF: PdfSourceAnalysis = {
  status: "recognized", passwordRequired: false, matchMethod: "hash", edition: "playtest-alpha-v1.1",
  variant: "agents", supportedActs: ["actOne", "actTwo"], issues: [],
  facts: { pre: { byteLength: 100, sha256: "test", pdfVersion: "1.7", encryption: { present: false },
    trailerId: null, plaintextCatalogHints: null },
    parseAttempt: { status: "success", facts: { pageCount: 104, producer: null, creator: null,
      lang: null, versionStampTag: "v1.1", contentSignatureSha256: null } } },
};

let actualOpenZipArchive: typeof import("../../adapters/files/open-zip-archive").openZipArchive;

beforeEach(async () => {
  mocks.hashes["ato-i-extras"].fingerprintHashes = [""];
  mocks.hashes["ato-ii-extras"].fingerprintHashes = [""];
  mocks.hashes["ato-i-extras"].logicalRootPrefix = undefined;
  mocks.hashes["ato-ii-extras"].logicalRootPrefix = undefined;
  for (const pkg of Object.values(mocks.hashes)) {
    pkg.structuralManifestHash = undefined;
    pkg.expectedFileCount = undefined;
    pkg.anchors = undefined;
    pkg.identity = undefined;
    pkg.supplemental = undefined;
  }
  const actual = await vi.importActual<typeof import("../../adapters/files/open-zip-archive")>(
    "../../adapters/files/open-zip-archive",
  );
  actualOpenZipArchive = actual.openZipArchive;
  mocks.openZipArchive.mockReset().mockImplementation(actualOpenZipArchive);
});

describe("materializeAdventureAssets", () => {
  it("keeps a validated legacy ZIP hash on the central-directory fast path", async () => {
    const file = await zipFile([["Mapa/a.jpg", "map"]]);
    const { entries } = await readZipCentralDirectory(file);
    mocks.hashes["ato-i-extras"].fingerprintHashes = [await sha256Hex(new TextEncoder().encode(
      buildCanonicalZipFingerprintInput(entries)))];
    expect(await analyzeZipActSource(file, "actOne"))
      .toMatchObject({ status: "recognized", matchMethod: "hash" });
    expect(mocks.openZipArchive).not.toHaveBeenCalled();
  });

  it("closes the extraction reader when structural content verification fails", async () => {
    const file = await zipFile([["Mapa/a.jpg", "map"], ["Tokens/b.png", "token"], ["Handouts/c.jpg", "handout"]]);
    const { entries } = await readZipCentralDirectory(file);
    const payload = buildStructuralZipPayload(entries);
    const hash = await sha256Hex(new TextEncoder().encode(buildStructuralZipManifestInput(payload)));
    const pkg = mocks.hashes["ato-ii-extras"];
    pkg.structuralManifestHash = hash;
    pkg.expectedFileCount = payload.length;
    pkg.anchors = payload.map(({ path, uncompressedSize, crc32 }) => ({ path, uncompressedSize, crc32 }));
    pkg.identity = { structuralManifestHash: hash, expectedFileCount: payload.length,
      contentManifestHash: "expected-content" };
    const actual = await actualOpenZipArchive(file);
    const close = vi.fn(() => actual.close());
    mocks.openZipArchive.mockResolvedValueOnce({ ...actual, close,
      entries: actual.entries.map((entry, index) => index === 0
        ? { ...entry, extract: async () => { throw new Error("CRC failed"); } } : entry),
    });
    const result = await analyzeZipActSource(file, "actTwo");
    expect(result.status).toBe("invalid");
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not store a verified supplemental audio or create a reference for it", async () => {
    const file = await zipFile([["Mapa/a.jpg", "map"], ["Handouts/Audio EMF 1.mp3", "audio"]]);
    const { entries } = await readZipCentralDirectory(file);
    const audio = entries.find((entry) => entry.path === "Handouts/Audio EMF 1.mp3")!;
    mocks.hashes["ato-ii-extras"].supplemental = [{ ...audio, contentSha256: await sha256Hex(new TextEncoder().encode("audio")) }];
    const analysis = await recognizeForTest(file, "actTwo");
    const target = storage();
    const result = await materializeAdventureAssets({
      actOne: null, actTwo: file, actOneAnalysis: null, actTwoAnalysis: analysis,
      pdfAnalysis: PDF, selectedActs: ["actTwo"], acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    });
    expect(result.assets.map((asset) => asset.originalEntryPath)).toEqual(["Mapa/a.jpg"]);
    expect(target.uploads.map(({ file: upload }) => upload.name)).toEqual(["a.jpg"]);
  });

  it("materializes structural packages through logical paths and skips packaging noise", async () => {
    const one = await zipFile([
      ["ChangedRoot/Mapas/a.jpg", "map"], ["ChangedRoot/Tokens/b.png", "token"],
      ["ChangedRoot/Handouts/c.jpg", "handout"], ["__MACOSX/._a.jpg", "noise"],
    ]);
    const two = await zipFile([
      ["AnotherRoot/Mapa/a.jpg", "map"], ["AnotherRoot/Tokens/b.png", "token"],
      ["AnotherRoot/Handouts/c.jpg", "handout"], ["AnotherRoot/.DS_Store", "noise"],
    ]);
    for (const [act, file] of [["actOne", one], ["actTwo", two]] as const) {
      const { entries } = await readZipCentralDirectory(file);
      const payload = buildStructuralZipPayload(entries);
      const pkg = mocks.hashes[act === "actOne" ? "ato-i-extras" : "ato-ii-extras"];
      pkg.structuralManifestHash = await sha256Hex(new TextEncoder().encode(buildStructuralZipManifestInput(payload)));
      pkg.expectedFileCount = payload.length;
      pkg.anchors = payload.map(({ path, uncompressedSize, crc32 }) => ({ path, uncompressedSize, crc32 }));
      const archive = await actualOpenZipArchive(file);
      try {
        const content = await readZipContentFacts(archive, entries, payload);
        pkg.identity = { structuralManifestHash: pkg.structuralManifestHash,
          expectedFileCount: payload.length,
          contentManifestHash: await sha256Hex(new TextEncoder().encode(buildZipContentManifestInput(payload, content))) };
      } finally { await archive.close(); }
    }
    mocks.hashes["ato-i-extras"].logicalRootPrefix = "OfficialRoot";
    const oneAnalysis = await analyzeZipActSource(one, "actOne");
    const twoAnalysis = await analyzeZipActSource(two, "actTwo");
    expect(oneAnalysis.matchMethod).toBe("structural");
    expect(twoAnalysis.matchMethod).toBe("structural");

    const target = storage();
    const result = await materializeAdventureAssets({
      actOne: one, actTwo: two, actOneAnalysis: oneAnalysis, actTwoAnalysis: twoAnalysis,
      pdfAnalysis: PDF, selectedActs: ["actOne", "actTwo"], acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    });
    expect(result.assets).toHaveLength(6);
    expect(result.assets.find((asset) => asset.act === "actOne" && asset.originalEntryPath.endsWith("/a.jpg")))
      .toMatchObject({ originalEntryPath: "OfficialRoot/Mapas/a.jpg",
        storedPath: "worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-1/OfficialRoot/Mapas/a.jpg" });
    expect(result.assets.find((asset) => asset.act === "actTwo" && asset.originalEntryPath.endsWith("/a.jpg")))
      .toMatchObject({ originalEntryPath: "Mapa/a.jpg",
        storedPath: "worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-2/Mapa/a.jpg" });
    expect(target.uploads).toHaveLength(6);
  });

  it("preserves both original trees, sends correct bytes and official MIME, and can repeat", async () => {
    mocks.hashes["ato-i-extras"].logicalRootPrefix = "Ato I";
    const one = await zipFile([["Ato I/Retratos/ação.PNG", "portrait"], ["Ato I/Handouts/nota.pdf", "handout"]]);
    const two = await zipFile([["mapa.jpg", "map"], ["Trilhas/som.mp3", "audio"]]);
    const oneAnalysis = await recognizeForTest(one, "actOne");
    const twoAnalysis = await recognizeForTest(two, "actTwo");
    const target = storage();
    const input = {
      actOne: one, actTwo: two, actOneAnalysis: oneAnalysis, actTwoAnalysis: twoAnalysis,
      pdfAnalysis: PDF, selectedActs: ["actOne", "actTwo"] as const, acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    };
    const first = await materializeAdventureAssets(input);
    expect(first.materializedActs).toEqual(["actOne", "actTwo"]);
    expect(first.assets.map((asset) => asset.storedPath)).toEqual([
      "worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-1/Ato I/Retratos/ação.PNG",
      "worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-1/Ato I/Handouts/nota.pdf",
      "worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-2/mapa.jpg",
      "worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-2/Trilhas/som.mp3",
    ]);
    expect(target.uploads.map(({ file }) => [file.name, file.type])).toEqual([
      ["ação.PNG", "image/png"], ["nota.pdf", "application/pdf"],
      ["mapa.jpg", "image/jpeg"], ["som.mp3", "audio/mpeg"],
    ]);
    expect(await Promise.all(target.uploads.map(({ file }) => file.text()))).toEqual([
      "portrait", "handout", "map", "audio",
    ]);
    expect(target.created[0]).toContain("worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-1/Ato I");
    expect(target.created[1]).not.toContain("worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-2/Ato II");
    const second = await materializeAdventureAssets(input);
    expect(second.assets).toEqual(first.assets);
    expect(second.materializedActs).toEqual(first.materializedActs);
    expect(target.uploads).toHaveLength(8);
  });

  it("revalidates fingerprint after UI analysis and rejects a wrong act before writing", async () => {
    const recognized = await zipFile([["file.png", "known"]]);
    const analysis = await recognizeForTest(recognized, "actOne");
    const modified = await zipFile([["file.png", "modified"]]);
    const target = storage();
    await expect(materializeAdventureAssets({
      actOne: modified, actTwo: null, actOneAnalysis: analysis, actTwoAnalysis: null,
      pdfAnalysis: PDF, selectedActs: ["actOne"], acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    })).rejects.toThrow(/no longer recognized/);
    expect(target.created).toHaveLength(0);
    expect(target.uploads).toHaveLength(0);
    await expect(materializeAdventureAssets({
      actOne: null, actTwo: recognized, actOneAnalysis: null, actTwoAnalysis: analysis,
      pdfAnalysis: PDF, selectedActs: ["actTwo"], acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    })).rejects.toThrow(/Fonte indisponível/);
  });

  it("preflights both acts before writing either one", async () => {
    const one = await zipFile([["first.png", "first"]]);
    const two = await zipFile([["second.png", "second"]]);
    const oneAnalysis = await recognizeForTest(one, "actOne");
    const twoAnalysis = await recognizeForTest(two, "actTwo");
    const changedTwo = await zipFile([["second.png", "changed"]]);
    const target = storage();
    await expect(materializeAdventureAssets({
      actOne: one, actTwo: changedTwo, actOneAnalysis: oneAnalysis, actTwoAnalysis: twoAnalysis,
      pdfAnalysis: PDF, selectedActs: ["actOne", "actTwo"], acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    })).rejects.toThrow(/no longer recognized/);
    expect(target.created).toHaveLength(0);
    expect(target.uploads).toHaveLength(0);
  });

  it("rejects divergence between central-directory manifest and zip.js before uploads", async () => {
    const one = await zipFile([["file.png", "known"]]);
    const analysis = await recognizeForTest(one, "actOne");
    const archive = await actualOpenZipArchive(one);
    mocks.openZipArchive.mockResolvedValueOnce({
      ...archive,
      entries: archive.entries.map((entry) => ({ ...entry, crc32: (entry.crc32 ?? 0) + 1 })),
    });
    const target = storage();
    await expect(materializeAdventureAssets({
      actOne: one, actTwo: null, actOneAnalysis: analysis, actTwoAnalysis: null,
      pdfAnalysis: PDF, selectedActs: ["actOne"], acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    })).rejects.toThrow(/manifest diverges/);
    expect(target.created).toHaveLength(0);
    expect(target.uploads).toHaveLength(0);
  });

  it("rejects unsupported MIME during preflight before writing", async () => {
    const one = await zipFile([["script.exe", "content"]]);
    const analysis = await recognizeForTest(one, "actOne");
    const target = storage();
    await expect(materializeAdventureAssets({
      actOne: one, actTwo: null, actOneAnalysis: analysis, actTwoAnalysis: null,
      pdfAnalysis: PDF, selectedActs: ["actOne"], acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    })).rejects.toThrow(/Unsupported upload extension/);
    expect(target.created).toHaveLength(0);
    expect(target.uploads).toHaveLength(0);
  });

  it("reports confirmed assets when a later upload fails without rolling them back", async () => {
    const one = await zipFile([["one.png", "one"], ["two.png", "two"]]);
    const analysis = await recognizeForTest(one, "actOne");
    const target = storage();
    const realUpload = target.uploadAndConfirm.bind(target);
    target.uploadAndConfirm = async (directory, file) => {
      if (file.name === "two.png") throw new Error("upload failed");
      return realUpload(directory, file);
    };
    const error = await materializeAdventureAssets({
      actOne: one, actTwo: null, actOneAnalysis: analysis, actTwoAnalysis: null,
      pdfAnalysis: PDF, selectedActs: ["actOne"], acknowledgeWarnings: false,
      storage: target, mimeTypes: MIME,
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(MaterializationError);
    expect(error).toMatchObject({ act: "actOne", entryPath: "two.png" });
    expect((error as MaterializationError).confirmedAssets).toHaveLength(1);
    expect(error).not.toHaveProperty("materializedActs");
    expect(target.uploads).toHaveLength(1);
  });
});
