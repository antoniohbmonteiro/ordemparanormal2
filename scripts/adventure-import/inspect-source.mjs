// Inspect locally supplied playtest sources without copying them into the repository.
// Usage: node --import tsx scripts/adventure-import/inspect-source.mjs <pdf|zip|compare-zip> <path> [other-zip] [--content]
import { open, readFile } from "node:fs/promises";
import { stdin, stderr } from "node:process";
import { emitKeypressEvents } from "node:readline";

import { sha256Hex } from "../../src/adapters/files/compute-sha256.ts";
import { readPdfPrePasswordFacts } from "../../src/adapters/files/read-pdf-pre-password-facts.ts";
import { readPdfParsedFacts } from "../../src/adapters/files/read-pdf-parsed-facts.ts";
import { readZipCentralDirectory } from "../../src/adapters/files/read-zip-central-directory.ts";
import { openZipArchive } from "../../src/adapters/files/open-zip-archive.ts";
import { readZipContentFacts } from "../../src/adapters/files/read-zip-content-facts.ts";
import { buildZipContentManifestInput } from "../../src/core/adventure-import/zip-content-manifest.ts";
import { identityPayload } from "../../src/core/adventure-import/recognize-zip-source.ts";
import { buildCanonicalZipFingerprintInput } from "../../src/core/adventure-import/zip-fingerprint.ts";
import { buildStructuralZipManifestInput, buildStructuralZipPayload } from "../../src/core/adventure-import/zip-structural-manifest.ts";
import { KNOWN_PDF_EDITIONS, KNOWN_ZIP_PACKAGES } from "../../src/core/adventure-import/known-adventure-sources.ts";
import { recognizePdfSource } from "../../src/core/adventure-import/recognize-pdf-source.ts";
import { recognizeZipSource } from "../../src/core/adventure-import/recognize-zip-source.ts";

async function promptPassword() {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error("A password-protected PDF requires an interactive terminal.");
  stderr.write("Senha do PDF: ");
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  try {
    return await new Promise((resolve, reject) => {
      let password = "";
      const onKey = (_character, key) => {
        if (key?.ctrl && key.name === "c") { cleanup(); reject(new Error("Cancelled")); return; }
        if (key?.name === "return" || key?.name === "enter") { cleanup(); resolve(password); return; }
        if (key?.name === "backspace") { password = password.slice(0, -1); return; }
        if (key?.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) password += key.sequence;
      };
      const cleanup = () => stdin.off("keypress", onKey);
      stdin.on("keypress", onKey);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    stderr.write("\n");
  }
}

async function inspectPdf(path) {
  const buffer = await readFile(path);
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const binarySha256 = await sha256Hex(bytes);
  const pre = readPdfPrePasswordFacts(bytes, binarySha256);
  let password = pre.encryption.present ? await promptPassword() : null;
  const pdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let parseAttempt = await readPdfParsedFacts(bytes, password, { includeContentSignature: true, pdfJs });
  if (parseAttempt.status === "password-required" && password === null) {
    password = await promptPassword();
    parseAttempt = await readPdfParsedFacts(bytes, password, { includeContentSignature: true, pdfJs });
  }
  const recognition = recognizePdfSource(pre, parseAttempt, KNOWN_PDF_EDITIONS);
  console.log(JSON.stringify({ binarySha256, pre, parseAttempt, recognition: {
    status: recognition.status, edition: recognition.edition, variant: recognition.variant,
    supportedActs: recognition.supportedActs, matchMethod: recognition.matchMethod,
    passwordRequired: recognition.passwordRequired, issues: recognition.issues,
  } }, null, 2));
  if (parseAttempt.status !== "success") process.exitCode = 1;
}

async function withZipFile(path, action) {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const file = { size, slice(start, end) {
      return { async arrayBuffer() {
        const length = Math.max(0, end - start);
        const buffer = Buffer.alloc(length);
        let read = 0;
        while (read < length) {
          const result = await handle.read(buffer, read, length - read, start + read);
          if (result.bytesRead === 0) break;
          read += result.bytesRead;
        }
        return buffer.subarray(0, read).buffer.slice(buffer.byteOffset, buffer.byteOffset + read);
      } };
    } };
    return await action(file);
  } finally {
    await handle.close();
  }
}

async function zipFacts(path, includeContent = false) {
  const facts = await withZipFile(path, async (file) => {
    const { entries, issues } = await readZipCentralDirectory(file);
    if (issues.some((issue) => issue.severity === "error")) throw new Error(JSON.stringify(issues));
    const payload = buildStructuralZipPayload(entries);
    const [legacyFingerprintHash, structuralManifestHash] = await Promise.all([
      sha256Hex(new TextEncoder().encode(buildCanonicalZipFingerprintInput(entries))),
      sha256Hex(new TextEncoder().encode(buildStructuralZipManifestInput(payload))),
    ]);
    return { legacyFingerprintHash, structuralManifestHash, expectedFileCount: payload.length,
      entries: payload.map(({ path, uncompressedSize, crc32 }) => ({ path, uncompressedSize, crc32 })),
      issues, rawEntryCount: entries.length, rawEntries: entries, canonicalPayload: payload };
  });
  if (!includeContent) return facts;
  const bytes = await readFile(path);
  const archive = await openZipArchive(new File([bytes], "source.zip"));
  try {
    const contentShaByPath = await readZipContentFacts(archive, facts.rawEntries, facts.canonicalPayload);
    const identityContentManifestHashes = Object.fromEntries(await Promise.all(
      Object.entries(KNOWN_ZIP_PACKAGES).map(async ([id, pkg]) => [id, await sha256Hex(new TextEncoder().encode(
        buildZipContentManifestInput(identityPayload(facts.canonicalPayload, pkg), contentShaByPath),
      ))]),
    ));
    const identityStructuralManifestHashes = Object.fromEntries(await Promise.all(
      Object.entries(KNOWN_ZIP_PACKAGES).map(async ([id, pkg]) => [id, await sha256Hex(new TextEncoder().encode(
        buildStructuralZipManifestInput(identityPayload(facts.canonicalPayload, pkg)),
      ))]),
    ));
    return { ...facts, contentShaByPath: Object.fromEntries(contentShaByPath),
      identityContentManifestHashes, identityStructuralManifestHashes };
  } finally {
    await archive.close();
  }
}

async function inspectZip(path, includeContent) {
  const facts = await zipFacts(path, includeContent);
  const signature = { manifestHash: facts.structuralManifestHash, fileCount: facts.expectedFileCount,
    entries: facts.entries, identityManifestHashes: facts.identityStructuralManifestHashes };
  const matches = ["actOne", "actTwo"].map((act) => {
    const packageId = act === "actOne" ? "ato-i-extras" : "ato-ii-extras";
    const result = recognizeZipSource(facts.rawEntries, facts.legacyFingerprintHash, act, KNOWN_ZIP_PACKAGES,
      facts.issues, { ...signature,
        contentManifestHash: facts.identityContentManifestHashes?.[packageId],
        contentShaByPath: facts.contentShaByPath && new Map(Object.entries(facts.contentShaByPath)),
      });
    return { act, status: result.status, edition: result.edition, matchMethod: result.matchMethod, issues: result.issues };
  });
  const { rawEntries: _rawEntries, canonicalPayload: _canonicalPayload, ...printable } = facts;
  console.log(JSON.stringify({ ...printable, matches }, null, 2));
}

async function compareZip(firstPath, secondPath, anchorPaths, includeContent) {
  const [first, second] = await Promise.all([zipFacts(firstPath, includeContent), zipFacts(secondPath, includeContent)]);
  const secondEntries = new Map(second.entries.map((entry) => [entry.path, entry]));
  const commonEntries = first.entries.filter((entry) => {
    const other = secondEntries.get(entry.path);
    return other && other.uncompressedSize === entry.uncompressedSize && other.crc32 === entry.crc32;
  });
  const equalCount = first.expectedFileCount === second.expectedFileCount;
  const equalManifest = first.structuralManifestHash === second.structuralManifestHash;
  const firstEntries = new Map(first.entries.map((entry) => [entry.path, entry]));
  const selectedAnchors = anchorPaths.map((path) => {
    const left = firstEntries.get(path);
    const right = secondEntries.get(path);
    return { path, first: left ?? null, second: right ?? null, equal: Boolean(left && right
      && left.uncompressedSize === right.uncompressedSize && left.crc32 === right.crc32) };
  });
  const anchorsEqual = anchorPaths.length === 3 && new Set(anchorPaths).size === 3
    && selectedAnchors.every((anchor) => anchor.equal);
  const actTwo = KNOWN_ZIP_PACKAGES["ato-ii-extras"];
  const supplemental = new Map(actTwo.supplemental.map((entry) => [entry.path, entry]));
  const identityEqual = includeContent ? first.identityStructuralManifestHashes["ato-ii-extras"]
    === second.identityStructuralManifestHashes["ato-ii-extras"]
    && first.identityStructuralManifestHashes["ato-ii-extras"] === actTwo.identity.structuralManifestHash : null;
  const contentEqual = includeContent && first.identityContentManifestHashes["ato-ii-extras"]
    === second.identityContentManifestHashes["ato-ii-extras"]
    && first.identityContentManifestHashes["ato-ii-extras"] === actTwo.identity.contentManifestHash;
  const onlyFirst = first.entries.filter((entry) => !secondEntries.has(entry.path));
  const onlySecond = second.entries.filter((entry) => !firstEntries.has(entry.path));
  const changedCommon = first.entries.filter((entry) => { const other = secondEntries.get(entry.path);
    return other && (other.uncompressedSize !== entry.uncompressedSize || other.crc32 !== entry.crc32); })
    .map((entry) => ({ path: entry.path, first: entry, second: secondEntries.get(entry.path) }));
  const supplementsValid = (facts) => facts.entries.every((entry) => {
    const expected = supplemental.get(entry.path);
    return !expected || (expected.uncompressedSize === entry.uncompressedSize && expected.crc32 === entry.crc32
      && facts.contentShaByPath[entry.path] === expected.contentSha256);
  });
  const safeSupplementalOmission = Boolean(contentEqual && identityEqual && onlySecond.length === 0
    && supplementsValid(first) && supplementsValid(second)
    && onlyFirst.every((entry) => { const expected = supplemental.get(entry.path);
      return expected && expected.uncompressedSize === entry.uncompressedSize && expected.crc32 === entry.crc32
        && first.contentShaByPath[entry.path] === expected.contentSha256; }));
  console.log(JSON.stringify({
    equalCount, equalManifest, anchorsEqual: anchorPaths.length ? anchorsEqual : null,
    readyToRegister: equalCount && equalManifest && anchorsEqual,
    identityEqual, contentEqual, safeSupplementalOmission,
    first: { legacyFingerprintHash: first.legacyFingerprintHash, structuralManifestHash: first.structuralManifestHash,
      expectedFileCount: first.expectedFileCount },
    second: { legacyFingerprintHash: second.legacyFingerprintHash, structuralManifestHash: second.structuralManifestHash,
      expectedFileCount: second.expectedFileCount },
    commonAnchorCandidates: commonEntries, selectedAnchors,
    ...(includeContent ? {
      firstIdentityContentManifestHashes: first.identityContentManifestHashes,
      secondIdentityContentManifestHashes: second.identityContentManifestHashes,
      changedCommon,
      commonContentDifferences: first.entries.filter((entry) => secondEntries.has(entry.path) &&
        first.contentShaByPath[entry.path] !== second.contentShaByPath[entry.path]).map((entry) => entry.path),
      onlyFirst, onlySecond,
    } : {}),
  }, null, 2));
  if ((!equalCount || !equalManifest || (anchorPaths.length > 0 && !anchorsEqual))
    && !safeSupplementalOmission) process.exitCode = 1;
}

const [, , kind, path, otherPath, ...rest] = process.argv;
if (kind === "pdf" && path && !otherPath) await inspectPdf(path);
else if (kind === "zip" && path && (!otherPath || otherPath === "--content") && rest.length === 0) await inspectZip(path, otherPath === "--content");
else if (kind === "compare-zip" && path && otherPath
  && (rest.length === 0 || (rest.length === 1 && rest[0] === "--content")
    || (rest.length === 4 && rest[0] === "--anchors"))) {
  await compareZip(path, otherPath, rest[0] === "--anchors" ? rest.slice(1) : [], rest[0] === "--content");
}
else {
  stderr.write("Usage: node --import tsx scripts/adventure-import/inspect-source.mjs <pdf|zip|compare-zip> <path> [other-zip] [--content | --anchors path1 path2 path3]\n");
  process.exitCode = 1;
}
