import { sha256Hex } from "../../adapters/files/compute-sha256";
import { readPdfParsedFacts } from "../../adapters/files/read-pdf-parsed-facts";
import { readPdfPrePasswordFacts } from "../../adapters/files/read-pdf-pre-password-facts";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import { openZipArchive } from "../../adapters/files/open-zip-archive";
import { readZipContentFacts } from "../../adapters/files/read-zip-content-facts";
import { KNOWN_PDF_EDITIONS, KNOWN_ZIP_PACKAGES } from "../../core/adventure-import/known-adventure-sources";
import type { PdfParseAttempt } from "../../core/adventure-import/pdf-source-facts";
import { recognizePdfSource, type PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import {
  recognizeZipSource,
  identityPayload,
  isStructuralCandidate,
  type AdventureAct,
  type ZipSourceAnalysis,
} from "../../core/adventure-import/recognize-zip-source";
import { buildCanonicalZipFingerprintInput } from "../../core/adventure-import/zip-fingerprint";
import { buildStructuralZipManifestInput, buildStructuralZipPayload, validateZipRawEntries } from "../../core/adventure-import/zip-structural-manifest";
import { buildZipContentManifestInput } from "../../core/adventure-import/zip-content-manifest";
import type { ZipPackageId } from "../../core/adventure-import/known-adventure-sources";
import { evaluateActCompatibility, type ActCompatibility } from "../../core/adventure-import/adventure-source-compatibility";

export interface AdventureSourceAnalysis {
  readonly pdf: PdfSourceAnalysis;
  readonly actOne: ZipSourceAnalysis | null;
  readonly actTwo: ZipSourceAnalysis | null;
  readonly acts: Readonly<Record<AdventureAct, ActCompatibility>>;
}

export interface AnalyzeAdventureSourcesInput {
  readonly pdf: File;
  readonly actOne: File | null;
  readonly actTwo: File | null;
  readonly password: string | null;
}

export async function analyzePdfSource(file: File, password: string | null): Promise<PdfSourceAnalysis> {
  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  const pre = readPdfPrePasswordFacts(bytes, sha256);
  const knownHash = Object.values(KNOWN_PDF_EDITIONS).some((edition) => edition.sha256Hashes.includes(sha256));

  // If the file is known to be encrypted and no password was supplied, skip the
  // parse attempt entirely — its outcome (needs a password) is already known, so
  // calling pdf.js here would only be wasted work.
  const parseAttempt: PdfParseAttempt =
    pre.encryption.present && password === null
      ? { status: "not-attempted" }
      : await readPdfParsedFacts(bytes, password, { includeContentSignature: !knownHash });

  return recognizePdfSource(pre, parseAttempt, KNOWN_PDF_EDITIONS);
}

export async function analyzeZipActSource(file: File, act: AdventureAct): Promise<ZipSourceAnalysis> {
  const { entries, issues } = await readZipCentralDirectory(file);
  if (issues.some((issue) => issue.severity === "error")) {
    return recognizeZipSource(entries, "", act, KNOWN_ZIP_PACKAGES, issues);
  }

  try {
    validateZipRawEntries(entries);
  } catch {
    return recognizeZipSource(entries, "", act, KNOWN_ZIP_PACKAGES, issues);
  }
  const fingerprintHash = await sha256Hex(new TextEncoder().encode(buildCanonicalZipFingerprintInput(entries)));
  const payload = buildStructuralZipPayload(entries);
  if (Object.values(KNOWN_ZIP_PACKAGES).some((pkg) => pkg.fingerprintHashes.includes(fingerprintHash))) {
    return recognizeZipSource(entries, fingerprintHash, act, KNOWN_ZIP_PACKAGES, issues, {
      manifestHash: "", fileCount: payload.length, entries: payload,
    });
  }
  const manifestHash = await sha256Hex(new TextEncoder().encode(buildStructuralZipManifestInput(payload)));
  const packageIds = Object.keys(KNOWN_ZIP_PACKAGES) as ZipPackageId[];
  const identityManifestHashes = Object.fromEntries(await Promise.all(packageIds.map(async (id) => [
    id, await sha256Hex(new TextEncoder().encode(buildStructuralZipManifestInput(identityPayload(payload, KNOWN_ZIP_PACKAGES[id])))),
  ]))) as Partial<Record<ZipPackageId, string>>;
  const signature = { manifestHash, fileCount: payload.length, entries: payload, identityManifestHashes };
  const candidateId = packageIds.find((id) => isStructuralCandidate(id, KNOWN_ZIP_PACKAGES[id], signature));
  if (!candidateId) return recognizeZipSource(entries, fingerprintHash, act, KNOWN_ZIP_PACKAGES, issues, signature);

  let archive: Awaited<ReturnType<typeof openZipArchive>>;
  try {
    archive = await openZipArchive(file);
  } catch {
    return recognizeZipSource(entries, fingerprintHash, act, KNOWN_ZIP_PACKAGES,
      [...issues, { code: "zip-invalid-entries", severity: "error" }]);
  }
  try {
    const contentShaByPath = await readZipContentFacts(archive, entries, payload);
    const contentManifestHash = await sha256Hex(new TextEncoder().encode(buildZipContentManifestInput(
      identityPayload(payload, KNOWN_ZIP_PACKAGES[candidateId]), contentShaByPath,
    )));
    return recognizeZipSource(entries, fingerprintHash, act, KNOWN_ZIP_PACKAGES, issues,
      { ...signature, contentManifestHash, contentShaByPath });
  } catch {
    return recognizeZipSource(entries, fingerprintHash, act, KNOWN_ZIP_PACKAGES,
      [...issues, { code: "zip-invalid-entries", severity: "error" }]);
  } finally {
    await archive.close();
  }
}

export async function analyzeAdventureSources(
  input: AnalyzeAdventureSourcesInput,
): Promise<AdventureSourceAnalysis> {
  const [pdf, actOne, actTwo] = await Promise.all([
    analyzePdfSource(input.pdf, input.password),
    input.actOne ? analyzeZipActSource(input.actOne, "actOne") : Promise.resolve(null),
    input.actTwo ? analyzeZipActSource(input.actTwo, "actTwo") : Promise.resolve(null),
  ]);

  return { pdf, actOne, actTwo, acts: {
    actOne: evaluateActCompatibility("actOne", pdf, actOne),
    actTwo: evaluateActCompatibility("actTwo", pdf, actTwo),
  } };
}
