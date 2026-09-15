import { sha256Hex } from "../../adapters/files/compute-sha256";
import { readPdfParsedFacts } from "../../adapters/files/read-pdf-parsed-facts";
import { readPdfPrePasswordFacts } from "../../adapters/files/read-pdf-pre-password-facts";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import { KNOWN_PDF_EDITIONS, KNOWN_ZIP_PACKAGES } from "../../core/adventure-import/known-adventure-sources";
import type { PdfParseAttempt } from "../../core/adventure-import/pdf-source-facts";
import { recognizePdfSource, type PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import {
  recognizeZipSource,
  type AdventureAct,
  type ZipSourceAnalysis,
} from "../../core/adventure-import/recognize-zip-source";
import { buildCanonicalZipFingerprintInput } from "../../core/adventure-import/zip-fingerprint";

export interface AdventureSourceAnalysis {
  readonly pdf: PdfSourceAnalysis;
  readonly actOne: ZipSourceAnalysis | null;
  readonly actTwo: ZipSourceAnalysis | null;
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

  // If the file is known to be encrypted and no password was supplied, skip the
  // parse attempt entirely — its outcome (needs a password) is already known, so
  // calling pdf.js here would only be wasted work.
  const parseAttempt: PdfParseAttempt =
    pre.encryption.present && password === null
      ? { status: "not-attempted" }
      : await readPdfParsedFacts(bytes, password);

  return recognizePdfSource(pre, parseAttempt, KNOWN_PDF_EDITIONS);
}

export async function analyzeZipActSource(file: File, act: AdventureAct): Promise<ZipSourceAnalysis> {
  const { entries, issues } = await readZipCentralDirectory(file);
  if (issues.some((issue) => issue.severity === "error")) {
    return recognizeZipSource(entries, "", act, KNOWN_ZIP_PACKAGES, issues);
  }

  const canonicalInput = buildCanonicalZipFingerprintInput(entries);
  const fingerprintHash = await sha256Hex(new TextEncoder().encode(canonicalInput));
  return recognizeZipSource(entries, fingerprintHash, act, KNOWN_ZIP_PACKAGES, issues);
}

export async function analyzeAdventureSources(
  input: AnalyzeAdventureSourcesInput,
): Promise<AdventureSourceAnalysis> {
  const [pdf, actOne, actTwo] = await Promise.all([
    analyzePdfSource(input.pdf, input.password),
    input.actOne ? analyzeZipActSource(input.actOne, "actOne") : Promise.resolve(null),
    input.actTwo ? analyzeZipActSource(input.actTwo, "actTwo") : Promise.resolve(null),
  ]);

  return { pdf, actOne, actTwo };
}
