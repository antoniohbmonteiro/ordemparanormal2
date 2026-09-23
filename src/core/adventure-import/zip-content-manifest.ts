import type { CanonicalZipPayloadEntry } from "./zip-structural-manifest";

/** Canonical input for SHA-256 of verified uncompressed payload bytes. */
export function buildZipContentManifestInput(
  entries: readonly CanonicalZipPayloadEntry[],
  contentShaByPath: ReadonlyMap<string, string>,
): string {
  const sorted = [...entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const lines = sorted.map((entry) => {
    const sha = contentShaByPath.get(entry.path);
    if (!sha || !/^[0-9a-f]{64}$/.test(sha)) throw new Error(`Missing content SHA-256: ${entry.path}`);
    return `${entry.path}\t${entry.uncompressedSize}\t${sha}`;
  });
  return `op2-zip-content-v1\n${sorted.length}\n${lines.join("\n")}`;
}
