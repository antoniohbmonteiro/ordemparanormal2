import { isZipDirectoryEntry, type ZipCentralDirectoryEntry } from "./zip-central-directory-entry";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function detectCommonRootPrefix(paths: readonly string[]): string | null {
  if (paths.length === 0) return null;

  const firstSegments = paths.map((path) => path.split("/")[0]);
  const [firstSegment] = firstSegments;
  const everyPathHasRoot = paths.every((path) => path.includes("/"));
  const allShareSameFirstSegment = firstSegments.every((segment) => segment === firstSegment);

  return everyPathHasRoot && allShareSameFirstSegment ? `${firstSegment}/` : null;
}

/**
 * Normalizes separators, drops directory entries, and strips a common root folder
 * (only when every remaining file entry shares one) — the shared canonicalization
 * step behind both the fingerprint string and the structural inventory, so the two
 * can never disagree about which entries count as "files" or what their path is.
 */
export function normalizeZipFileEntries(
  entries: readonly ZipCentralDirectoryEntry[],
): readonly ZipCentralDirectoryEntry[] {
  const fileEntries = entries
    .map((entry) => ({ ...entry, path: normalizePath(entry.path) }))
    .filter((entry) => !isZipDirectoryEntry(entry.path));

  const rootPrefix = detectCommonRootPrefix(fileEntries.map((entry) => entry.path));

  return fileEntries.map((entry) => ({
    ...entry,
    path: rootPrefix && entry.path.startsWith(rootPrefix) ? entry.path.slice(rootPrefix.length) : entry.path,
  }));
}

export function buildCanonicalZipFingerprintInput(
  entries: readonly ZipCentralDirectoryEntry[],
): string {
  const canonicalEntries = [...normalizeZipFileEntries(entries)].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  return canonicalEntries
    .map((entry) => `${entry.path}\t${entry.uncompressedSize}\t${entry.crc32}`)
    .join("\n");
}
