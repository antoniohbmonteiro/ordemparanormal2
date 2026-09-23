import { assertDistinctZipPaths, safeZipEntryPath } from "./safe-zip-entry-path";
import type { ZipCentralDirectoryEntry } from "./zip-central-directory-entry";
import { isZipDirectoryEntry } from "./zip-central-directory-entry";
import { normalizeZipFileEntries } from "./zip-fingerprint";

export interface CanonicalZipPayloadEntry extends ZipCentralDirectoryEntry {
  readonly originalPath: string;
}

function isPackagingNoise(path: string): boolean {
  const segments = path.replace(/\\/g, "/").split("/");
  return segments.at(-1) === ".DS_Store"
    || (segments.length > 1 && segments[0] === "__MACOSX");
}

/** Validate every raw entry before any fingerprint or structural comparison. */
export function validateZipRawEntries(entries: readonly ZipCentralDirectoryEntry[]): void {
  const paths = entries.map((entry) => {
    if (!Number.isInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > 0xffffffff
      || !Number.isInteger(entry.crc32) || entry.crc32 < 0 || entry.crc32 > 0xffffffff) {
      throw new Error(`Invalid ZIP entry metadata: ${entry.path}`);
    }
    return safeZipEntryPath(entry.path);
  });
  assertDistinctZipPaths(paths);
}

/** Returns payload entries in ordinal path order after the structural canonicalization. */
export function buildStructuralZipPayload(entries: readonly ZipCentralDirectoryEntry[]): readonly CanonicalZipPayloadEntry[] {
  validateZipRawEntries(entries);

  const payload = entries.filter((entry) => !isZipDirectoryEntry(entry.path))
    .filter((entry) => !isPackagingNoise(entry.path));
  const normalized = normalizeZipFileEntries(payload);
  const canonical = normalized.map((entry, index) => ({
    ...entry,
    path: entry.path.normalize("NFC"),
    originalPath: payload[index].path,
  }));
  assertDistinctZipPaths(canonical.map((entry) => safeZipEntryPath(entry.path)));
  return canonical.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function buildStructuralZipManifestInput(entries: readonly CanonicalZipPayloadEntry[]): string {
  return entries.map((entry) => `${entry.path}\t${entry.uncompressedSize}\t${entry.crc32}`).join("\n");
}
