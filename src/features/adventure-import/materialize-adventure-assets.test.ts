import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hashes: {
    "ato-i-extras": { fingerprintHash: "" },
    "ato-ii-extras": { fingerprintHash: "" },
  },
  openZipArchive: vi.fn(),
}));
vi.mock("../../core/adventure-import/known-adventure-sources", () => ({ KNOWN_ZIP_PACKAGES: mocks.hashes }));
vi.mock("../../adapters/files/open-zip-archive", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../adapters/files/open-zip-archive")>();
  return { ...original, openZipArchive: mocks.openZipArchive };
});

import { sha256Hex } from "../../adapters/files/compute-sha256";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import type { AdventureAssetStorage } from "../../adapters/foundry/adventure-asset-storage";
import { buildCanonicalZipFingerprintInput } from "../../core/adventure-import/zip-fingerprint";
import type { ZipSourceAnalysis } from "../../core/adventure-import/recognize-zip-source";
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
  mocks.hashes[act === "actOne" ? "ato-i-extras" : "ato-ii-extras"].fingerprintHash = hash;
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
    async ensureDirectories(dirs) { created.push([...dirs]); },
    async uploadAndConfirm(directory, file) {
      uploads.push({ directory, file });
      return `${directory}/${file.name}`;
    },
  };
}

const MIME = { png: "image/png", jpg: "image/jpeg", mp3: "audio/mpeg", pdf: "application/pdf" };

let actualOpenZipArchive: typeof import("../../adapters/files/open-zip-archive").openZipArchive;

beforeEach(async () => {
  mocks.hashes["ato-i-extras"].fingerprintHash = "";
  mocks.hashes["ato-ii-extras"].fingerprintHash = "";
  const actual = await vi.importActual<typeof import("../../adapters/files/open-zip-archive")>(
    "../../adapters/files/open-zip-archive",
  );
  actualOpenZipArchive = actual.openZipArchive;
  mocks.openZipArchive.mockReset().mockImplementation(actualOpenZipArchive);
});

describe("materializeAdventureAssets", () => {
  it("preserves both original trees, sends correct bytes and official MIME, and can repeat", async () => {
    const one = await zipFile([["Ato I/Retratos/ação.PNG", "portrait"], ["Ato I/Handouts/nota.pdf", "handout"]]);
    const two = await zipFile([["mapa.jpg", "map"], ["Trilhas/som.mp3", "audio"]]);
    const oneAnalysis = await recognizeForTest(one, "actOne");
    const twoAnalysis = await recognizeForTest(two, "actTwo");
    const target = storage();
    const input = {
      actOne: one, actTwo: two, actOneAnalysis: oneAnalysis, actTwoAnalysis: twoAnalysis,
      storage: target, mimeTypes: MIME,
    };
    const first = await materializeAdventureAssets(input);
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
    expect(target.uploads).toHaveLength(8);
  });

  it("revalidates fingerprint after UI analysis and rejects a wrong act before writing", async () => {
    const recognized = await zipFile([["file.png", "known"]]);
    const analysis = await recognizeForTest(recognized, "actOne");
    const modified = await zipFile([["file.png", "modified"]]);
    const target = storage();
    await expect(materializeAdventureAssets({
      actOne: modified, actTwo: null, actOneAnalysis: analysis, actTwoAnalysis: null,
      storage: target, mimeTypes: MIME,
    })).rejects.toThrow(/no longer recognized/);
    expect(target.created).toHaveLength(0);
    expect(target.uploads).toHaveLength(0);
    await expect(materializeAdventureAssets({
      actOne: null, actTwo: recognized, actOneAnalysis: null, actTwoAnalysis: analysis,
      storage: target, mimeTypes: MIME,
    })).rejects.toThrow(/No recognized ZIP/);
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
      storage: target, mimeTypes: MIME,
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(MaterializationError);
    expect(error).toMatchObject({ act: "actOne", entryPath: "two.png" });
    expect((error as MaterializationError).confirmedAssets).toHaveLength(1);
    expect(target.uploads).toHaveLength(1);
  });
});
