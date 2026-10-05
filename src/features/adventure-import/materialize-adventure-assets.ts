import { openZipArchive, type OpenZipArchive, type ExtractableZipEntry } from "../../adapters/files/open-zip-archive";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import type { AdventureAssetStorage } from "../../adapters/foundry/adventure-asset-storage";
import { KNOWN_ZIP_PACKAGES, ZIP_PACKAGE_BY_ACT } from "../../core/adventure-import/known-adventure-sources";
import { assertDistinctZipPaths, safeZipEntryPath, type SafeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";
import { type AdventureAct, type ZipSourceAnalysis } from "../../core/adventure-import/recognize-zip-source";
import { buildStructuralZipPayload } from "../../core/adventure-import/zip-structural-manifest";
import { analyzeZipActSource } from "./analyze-adventure-sources";
import type { PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import { assertImportableActs, evaluateActCompatibility } from "../../core/adventure-import/adventure-source-compatibility";
import { adventureActRoot } from "./adventure-asset-layout";
import { agentNameFromZipEntries } from "../../core/adventure-import/agent-entry-name";
import type { AdventureDefinition } from "../../core/adventure-import/adventure-definition";

export interface MaterializedAsset {
  readonly act: AdventureAct;
  readonly originalEntryPath: string;
  readonly sourceEntryPath?: string;
  readonly storedPath: string;
}

export interface MaterializationResult {
  readonly assets: readonly MaterializedAsset[];
  readonly materializedActs: readonly AdventureAct[];
  readonly warnings?: readonly { readonly act: AdventureAct; readonly path: string }[];
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
  readonly pdfAnalysis: PdfSourceAnalysis;
  readonly selectedActs: readonly AdventureAct[];
  readonly acknowledgeWarnings: boolean;
  readonly storage: AdventureAssetStorage;
  readonly mimeTypes: Readonly<Record<string, string>>;
  readonly agentEntrySources?: {
    readonly definition: AdventureDefinition;
    readonly sources: readonly { readonly documentId: string; readonly act: AdventureAct;
      readonly portraitAssetId: string; readonly tokenAssetId: string }[];
  };
  readonly onProgress?: (completed: number, total: number) => void | Promise<void>;
}

interface PreparedFile {
  readonly path: SafeZipEntryPath;
  readonly sourceEntryPath: string;
  readonly mime: string;
  readonly entry: ExtractableZipEntry;
}

interface PreparedAct {
  readonly act: AdventureAct;
  readonly root: string;
  readonly archive: OpenZipArchive;
  readonly paths: readonly SafeZipEntryPath[];
  readonly files: readonly PreparedFile[];
  readonly missingSupplementalPaths: readonly string[];
}

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
  pdfAnalysis: PdfSourceAnalysis,
  acknowledgeWarnings: boolean,
): Promise<PreparedAct> {
  const recognition = await analyzeZipActSource(file, act);
  if (recognition.status !== "recognized" || recognition.edition !== ZIP_PACKAGE_BY_ACT[act]) {
    throw new Error(`ZIP is no longer recognized for ${act}`);
  }
  const compatibility = evaluateActCompatibility(act, pdfAnalysis, recognition);
  assertImportableActs({ actOne: compatibility, actTwo: compatibility }, [act], acknowledgeWarnings);
  const { entries: manifest, issues } = await readZipCentralDirectory(file);
  if (issues.some((issue) => issue.severity === "error")) throw new Error(`Invalid ZIP for ${act}`);
  const payload = buildStructuralZipPayload(manifest);
  const canonicalByOriginal = new Map(payload.map((entry) => [safeZipEntryPath(entry.originalPath).relativePath, entry.path]));
  const logicalRootPrefix = KNOWN_ZIP_PACKAGES[recognition.edition].logicalRootPrefix;
  const supplemental = new Set(KNOWN_ZIP_PACKAGES[recognition.edition].supplemental?.map((entry) => entry.path) ?? []);

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

    // Complete the CRC and size preflight for every payload before any selected Act writes.
    for (const [index, entry] of archive.entries.entries()) {
      const canonical = canonicalByOriginal.get(paths[index].relativePath);
      if (canonical === undefined || entry.directory) continue;
      const blob = await entry.extract();
      if (blob.size !== entry.uncompressedSize) throw new Error(`Extracted size differs for ${canonical}`);
    }

    const files = archive.entries.flatMap((entry, index): PreparedFile[] => {
      const canonical = canonicalByOriginal.get(paths[index].relativePath);
      if (entry.directory || canonical === undefined || supplemental.has(canonical)) return [];
      const logicalPath = safeZipEntryPath(logicalRootPrefix ? `${logicalRootPrefix}/${canonical}` : canonical);
      return [{ path: logicalPath, sourceEntryPath: entry.path, mime: mimeForFile(logicalPath, mimeTypes), entry }];
    });
    return {
      act,
      root: adventureActRoot(storage.worldId, act),
      archive,
      paths: files.map((prepared) => prepared.path),
      files,
      missingSupplementalPaths: recognition.missingSupplementalPaths ?? [],
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

function assertAgentSourceEntries(prepared: PreparedAct,
  contract: NonNullable<MaterializeAdventureAssetsInput["agentEntrySources"]>): void {
  function actualEntry(assetId: string): string {
    const asset = contract.definition.assets.find(candidate => candidate.id === assetId);
    if (!asset || asset.source.act !== prepared.act) throw new Error(`Asset de Agent inválido: ${assetId}.`);
    const matches = prepared.files.filter(file => file.path.originalPath === asset.source.originalEntryPath);
    if (matches.length !== 1) throw new Error(`Entry de Agent ausente ou ambíguo: ${assetId}.`);
    return matches[0].sourceEntryPath;
  }
  for (const source of contract.sources.filter(source => source.act === prepared.act)) {
    try { agentNameFromZipEntries(actualEntry(source.portraitAssetId), actualEntry(source.tokenAssetId)); }
    catch (error) { throw new Error(`Entries de Agent incompatíveis: ${source.documentId}.`, { cause: error }); }
  }
}

export async function materializeAdventureAssets(input: MaterializeAdventureAssetsInput): Promise<MaterializationResult> {
  const selectedActs = input.selectedActs;
  try {
    assertImportableActs({
      actOne: evaluateActCompatibility("actOne", input.pdfAnalysis, input.actOneAnalysis),
      actTwo: evaluateActCompatibility("actTwo", input.pdfAnalysis, input.actTwoAnalysis),
    }, selectedActs, input.acknowledgeWarnings);
  } catch (error) {
    throw new MaterializationError(error instanceof Error ? error.message : String(error), null, null, [], "preflight", { cause: error });
  }
  const selected = ([
    ["actOne", input.actOne, input.actOneAnalysis],
    ["actTwo", input.actTwo, input.actTwoAnalysis],
  ] as const).filter((candidate): candidate is readonly [AdventureAct, File, ZipSourceAnalysis] =>
    selectedActs.includes(candidate[0]) && candidate[1] !== null && candidate[2]?.status === "recognized"
      && candidate[2].edition === ZIP_PACKAGE_BY_ACT[candidate[0]],
  );
  if (selected.length !== selectedActs.length) throw new MaterializationError("Selected ZIP sources changed", null, null, [], "preflight");

  const prepared: PreparedAct[] = [];
  const confirmed: MaterializedAsset[] = [];
  let currentAct: AdventureAct | null = null;
  let currentEntry: string | null = null;
  let stage: MaterializationStage = "preflight";
  try {
    // All selected archives are checked before the first directory is created.
    for (const [act, file] of selected) {
      currentAct = act;
      prepared.push(await prepareAct(file, act, input.storage, input.mimeTypes,
        input.pdfAnalysis, input.acknowledgeWarnings));
    }
    if (input.agentEntrySources) for (const act of prepared) assertAgentSourceEntries(act, input.agentEntrySources);
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
        confirmed.push({ act: act.act, originalEntryPath: file.path.originalPath,
          sourceEntryPath: file.sourceEntryPath, storedPath });
        await input.onProgress?.(confirmed.length, total);
      }
    }
    return { assets: confirmed, materializedActs: selected.map(([act]) => act),
      warnings: prepared.flatMap((act) => act.missingSupplementalPaths.map((path) => ({ act: act.act, path }))) };
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
