import { sha256Hex } from "./compute-sha256";
import type { OpenZipArchive } from "./open-zip-archive";
import type { ZipCentralDirectoryEntry } from "../../core/adventure-import/zip-central-directory-entry";
import type { CanonicalZipPayloadEntry } from "../../core/adventure-import/zip-structural-manifest";
import { assertDistinctZipPaths, safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";

function entryKey(path: string, size: number, crc32: number, directory: boolean): string {
  return `${path}\u0000${size}\u0000${crc32}\u0000${directory}`;
}

/** Compare both ZIP readers and hash only canonical payload entries, one at a time. */
export async function readZipContentFacts(
  archive: OpenZipArchive,
  rawEntries: readonly ZipCentralDirectoryEntry[],
  payload: readonly CanonicalZipPayloadEntry[],
): Promise<ReadonlyMap<string, string>> {
  const rawPaths = rawEntries.map((entry) => safeZipEntryPath(entry.path));
  const archivePaths = archive.entries.map((entry) => safeZipEntryPath(entry.path));
  assertDistinctZipPaths(archivePaths);
  const expected = rawEntries.map((entry, index) => entryKey(
    rawPaths[index].relativePath, entry.uncompressedSize, entry.crc32, rawPaths[index].isDirectory,
  )).sort();
  const actual = archive.entries.map((entry, index) => entryKey(
    archivePaths[index].relativePath, entry.uncompressedSize, entry.crc32 ?? 0, entry.directory,
  )).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    throw new Error("ZIP central directory and extraction reader disagree");
  }
  if (archive.entries.some((entry) => entry.symlink)) throw new Error("ZIP contains a symlink");

  const logicalByRaw = new Map(payload.map((entry) => [safeZipEntryPath(entry.originalPath).relativePath, entry.path]));
  const result = new Map<string, string>();
  for (const [index, entry] of archive.entries.entries()) {
    const logicalPath = logicalByRaw.get(archivePaths[index].relativePath);
    if (logicalPath === undefined) continue;
    const blob = await entry.extract();
    if (blob.size !== entry.uncompressedSize) throw new Error(`ZIP extracted size differs: ${logicalPath}`);
    result.set(logicalPath, await sha256Hex(await blob.arrayBuffer()));
  }
  if (result.size !== payload.length) throw new Error("ZIP payload inventory differs between readers");
  return result;
}
