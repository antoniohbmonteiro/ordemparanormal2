// Local maintainer tool — never run against files that live inside this repository.
//
// Computes the same SHA-256 / ZIP fingerprint hashes the running system uses to
// recognize known Adventure Importer sources, by reusing the real adapter/core
// code (not a reimplementation), and prints only the resulting hash strings.
// Paste the printed value into src/core/adventure-import/known-adventure-sources.ts
// by hand — the source PDF/ZIP itself must never be added to the repository.
//
// Usage:
//   node scripts/adventure-import/print-known-source-hashes.mjs pdf "D:\path\to\file.pdf"
//   node scripts/adventure-import/print-known-source-hashes.mjs zip "D:\path\to\file.zip"

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { sha256Hex } from "../../src/adapters/files/compute-sha256.ts";
import { readZipCentralDirectory } from "../../src/adapters/files/read-zip-central-directory.ts";
import { isZipDirectoryEntry } from "../../src/core/adventure-import/zip-central-directory-entry.ts";

// Node's built-in TypeScript support (used to run this plain .mjs-adjacent script
// without a build step) only resolves relative imports that carry no runtime value
// without an explicit extension. `zip-fingerprint.ts` re-exports a runtime helper
// alongside a type from the same specifier, which Node's resolver can't follow here
// — so this one small canonicalization step (only) is mirrored inline, built on the
// real `isZipDirectoryEntry` predicate imported above. Keep this in sync with
// src/core/adventure-import/zip-fingerprint.ts if that algorithm ever changes.
function buildCanonicalZipFingerprintInput(entries) {
  const normalized = entries
    .map((entry) => ({ ...entry, path: entry.path.replace(/\\/g, "/") }))
    .filter((entry) => !isZipDirectoryEntry(entry.path));

  const firstSegments = normalized.map((entry) => entry.path.split("/")[0]);
  const [firstSegment] = firstSegments;
  const hasCommonRoot =
    normalized.length > 0 &&
    normalized.every((entry) => entry.path.includes("/")) &&
    firstSegments.every((segment) => segment === firstSegment);
  const rootPrefix = hasCommonRoot ? `${firstSegment}/` : null;

  return normalized
    .map((entry) => ({
      ...entry,
      path: rootPrefix && entry.path.startsWith(rootPrefix) ? entry.path.slice(rootPrefix.length) : entry.path,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((entry) => `${entry.path}\t${entry.uncompressedSize}\t${entry.crc32}`)
    .join("\n");
}

async function printPdfHash(path) {
  const buffer = await readFile(path);
  console.log(`sha256: ${await sha256Hex(buffer)}`);
}

async function printZipFingerprint(path) {
  const buffer = await readFile(path);
  const file = new File([buffer], basename(path));
  const { entries, issues } = await readZipCentralDirectory(file);
  for (const issue of issues) console.error(`issue: ${issue.code} (${issue.severity})`);
  const canonicalInput = buildCanonicalZipFingerprintInput(entries);
  console.log(`fingerprintHash: ${await sha256Hex(new TextEncoder().encode(canonicalInput))}`);
  console.log(`entries: ${entries.length}`);
}

const [, , kind, path] = process.argv;

if (kind === "pdf" && path) {
  await printPdfHash(path);
} else if (kind === "zip" && path) {
  await printZipFingerprint(path);
} else {
  console.error("Usage: node scripts/adventure-import/print-known-source-hashes.mjs <pdf|zip> <path-to-file>");
  process.exitCode = 1;
}
