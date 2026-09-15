import { sha256Hex } from "../../adapters/files/compute-sha256";
import { openZipArchive, type OpenZipArchive, type ExtractableZipEntry } from "../../adapters/files/open-zip-archive";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import type { AdventureAssetStorage } from "../../adapters/foundry/adventure-asset-storage";
import { KNOWN_ZIP_PACKAGES } from "../../core/adventure-import/known-adventure-sources";
import { assertDistinctZipPaths, safeZipEntryPath, type SafeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";
import { recognizeZipSource, type AdventureAct, type ZipSourceAnalysis } from "../../core/adventure-import/recognize-zip-source";
import { buildCanonicalZipFingerprintInput } from "../../core/adventure-import/zip-fingerprint";

export interface MaterializedAsset {
  readonly act: AdventureAct;
  readonly originalEntryPath: string;
  readonly storedPath: string;
}

export interface MaterializationResult {
  readonly assets: readonly MaterializedAsset[];
}

export type MaterializationStage = "preflight" | "directory" | "extract" | "upload";

export class MaterializationError extends Error {
  constructor(
    message: string,
    readonly act: AdventureAct | null,
    readonly entryPath: string | null,
    readonly confirmedAssets: readonly MaterializedAsset[],
    readonly stage: MaterializationStage,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MaterializationError";
  }
}

export interface MaterializeAdventureAssetsInput {
  readonly actOne: File | null;
  readonly actTwo: File | null;
  readonly actOneAnalysis: ZipSourceAnalysis | null;
  readonly actTwoAnalysis: ZipSourceAnalysis | null;
  readonly storage: AdventureAssetStorage;
  readonly mimeTypes: Readonly<Record<string, string>>;
  readonly onProgress?: (completed: number, total: number) => void | Promise<void>;
}

interface PreparedFile {
  readonly path: SafeZipEntryPath;
  readonly mime: string;
  readonly entry: ExtractableZipEntry;
}

interface PreparedAct {
  readonly act: AdventureAct;
  readonly root: string;
  readonly archive: OpenZipArchive;
  readonly paths: readonly SafeZipEntryPath[];
  readonly files: readonly PreparedFile[];
}

const EXPECTED_EDITION = { actOne: "ato-i-extras", actTwo: "ato-ii-extras" } as const;
const ACT_FOLDER = { actOne: "act-1", actTwo: "act-2" } as const;

function mimeForFile(path: SafeZipEntryPath, mimeTypes: Readonly<Record<string, string>>): string {
  const extension = path.basename.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  const mime = extension ? mimeTypes[extension] : undefined;
  if (!mime) throw new Error(`Unsupported upload extension: ${path.originalPath}`);
  return mime;
}

function entryKey(path: string, size: number, crc32: number, directory: boolean): string {
  return `${path}\u0000${size}\u0000${crc32}\u0000${directory}`;
}

async function prepareAct(
  file: File,
  act: AdventureAct,
  storage: AdventureAssetStorage,
  mimeTypes: Readonly<Record<string, string>>,
): Promise<PreparedAct> {
  const { entries: manifest, issues } = await readZipCentralDirectory(file);
  if (issues.some((issue) => issue.severity === "error")) throw new Error(`Invalid ZIP for ${act}`);
  const fingerprint = await sha256Hex(new TextEncoder().encode(buildCanonicalZipFingerprintInput(manifest)));
  const recognition = recognizeZipSource(manifest, fingerprint, act, KNOWN_ZIP_PACKAGES, issues);
  if (recognition.status !== "recognized" || recognition.edition !== EXPECTED_EDITION[act]) {
    throw new Error(`ZIP is no longer recognized for ${act}`);
  }

  const archive = await openZipArchive(file);
  try {
    const manifestPaths = manifest.map((entry) => safeZipEntryPath(entry.path));
    const paths = archive.entries.map((entry) => safeZipEntryPath(entry.path));
    assertDistinctZipPaths(paths);
    const expected = manifest.map((entry, index) => entryKey(
      manifestPaths[index].relativePath, entry.uncompressedSize, entry.crc32, manifestPaths[index].isDirectory,
    )).sort();
    const actual = archive.entries.map((entry, index) => entryKey(
      paths[index].relativePath, entry.uncompressedSize, entry.crc32 ?? 0, entry.directory,
    )).sort();
    if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
      throw new Error(`ZIP entry manifest diverges for ${act}`);
    }
    if (archive.entries.some((entry) => entry.symlink)) throw new Error(`ZIP contains a symlink for ${act}`);

    const files = archive.entries.flatMap((entry, index): PreparedFile[] =>
      entry.directory ? [] : [{ path: paths[index], mime: mimeForFile(paths[index], mimeTypes), entry }],
    );
    return {
      act,
      root: `worlds/${storage.worldId}/ordemparanormal2/adventures/playtest-alpha/${ACT_FOLDER[act]}`,
      archive,
      paths,
      files,
    };
  } catch (error) {
    await archive.close();
    throw error;
  }
}

function directoriesForAct(prepared: PreparedAct): readonly string[] {
  const dirs = new Set<string>([prepared.root]);
  for (const path of prepared.paths) {
    const segments = (path.isDirectory ? path.relativePath : path.directory).split("/").filter(Boolean);
    for (let index = 1; index <= segments.length; index++) {
      dirs.add(`${prepared.root}/${segments.slice(0, index).join("/")}`);
    }
  }
  return [...dirs].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}

export async function materializeAdventureAssets(input: MaterializeAdventureAssetsInput): Promise<MaterializationResult> {
  const selected = ([
    ["actOne", input.actOne, input.actOneAnalysis],
    ["actTwo", input.actTwo, input.actTwoAnalysis],
  ] as const).filter((candidate): candidate is readonly [AdventureAct, File, ZipSourceAnalysis] =>
    candidate[1] !== null && candidate[2]?.status === "recognized"
      && candidate[2].edition === EXPECTED_EDITION[candidate[0]],
  );
  if (selected.length === 0) throw new MaterializationError("No recognized ZIP selected", null, null, [], "preflight");

  const prepared: PreparedAct[] = [];
  const confirmed: MaterializedAsset[] = [];
  let currentAct: AdventureAct | null = null;
  let currentEntry: string | null = null;
  let stage: MaterializationStage = "preflight";
  try {
    // All selected archives are checked before the first directory is created.
    for (const [act, file] of selected) {
      currentAct = act;
      prepared.push(await prepareAct(file, act, input.storage, input.mimeTypes));
    }
    const total = prepared.reduce((sum, act) => sum + act.files.length, 0);
    await input.onProgress?.(0, total);
    for (const act of prepared) {
      currentAct = act.act;
      currentEntry = null;
      stage = "directory";
      await input.storage.ensureDirectories(directoriesForAct(act));
      for (const file of act.files) {
        currentEntry = file.path.originalPath;
        stage = "extract";
        const blob = await file.entry.extract();
        if (blob.size !== file.entry.uncompressedSize) {
          throw new Error(`Extracted size differs for ${file.path.originalPath}`);
        }
        const upload = new File([blob], file.path.basename, { type: file.mime });
        const directory = file.path.directory ? `${act.root}/${file.path.directory}` : act.root;
        stage = "upload";
        const storedPath = await input.storage.uploadAndConfirm(directory, upload);
        confirmed.push({ act: act.act, originalEntryPath: file.path.originalPath, storedPath });
        await input.onProgress?.(confirmed.length, total);
      }
    }
    return { assets: confirmed };
  } catch (error) {
    throw new MaterializationError(
      error instanceof Error ? error.message : String(error), currentAct, currentEntry, [...confirmed],
      stage,
      { cause: error },
    );
  } finally {
    await Promise.all(prepared.map((act) => act.archive.close()));
  }
}
