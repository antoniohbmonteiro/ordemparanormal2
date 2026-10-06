import { KNOWN_AS09_PACKAGE } from "./known-adventure-sources";
import type { AdventureImportIssue, MatchMethod, RecognitionStatus } from "./recognition-status";
import type { ZipCentralDirectoryEntry } from "./zip-central-directory-entry";
import { validateZipRawEntries } from "./zip-structural-manifest";

export interface As09SourceAnalysis {
  readonly status: RecognitionStatus;
  readonly matchMethod: MatchMethod;
  readonly issues: readonly AdventureImportIssue[];
}
export interface As09Signature {
  readonly fileCount: number;
  readonly imageCount: number;
  readonly manifestHash?: string;
  readonly contentManifestHash?: string;
}
export interface As09Identity {
  readonly fingerprintHash: string;
  readonly structuralManifestHash: string;
  readonly expectedFileCount: number;
  readonly expectedImageCount: number;
  readonly contentManifestHash: string;
}

export function isAs09StructuralCandidate(signature: As09Signature, known: As09Identity = KNOWN_AS09_PACKAGE): boolean {
  return signature.fileCount === known.expectedFileCount && signature.imageCount === known.expectedImageCount
    && signature.manifestHash === known.structuralManifestHash;
}

export function recognizeAs09Source(entries: readonly ZipCentralDirectoryEntry[], fingerprint: string,
  signature: As09Signature, issues: readonly AdventureImportIssue[] = [],
  known: As09Identity = KNOWN_AS09_PACKAGE): As09SourceAnalysis {
  try { validateZipRawEntries(entries); }
  catch { return { status: "invalid", matchMethod: "none", issues: [...issues, { code: "zip-invalid-entries", severity: "error" }] }; }
  if (issues.some(issue => issue.severity === "error")) return { status: "invalid", matchMethod: "none", issues };
  if (fingerprint === known.fingerprintHash && signature.fileCount === known.expectedFileCount
    && signature.imageCount === known.expectedImageCount) return { status: "recognized", matchMethod: "hash", issues };
  if (isAs09StructuralCandidate(signature, known) && signature.contentManifestHash === known.contentManifestHash)
    return { status: "recognized", matchMethod: "structural", issues };
  return { status: "unknown", matchMethod: "none", issues: [...issues, {
    code: isAs09StructuralCandidate(signature, known) ? "zip-content-mismatch" : "zip-required-mismatch", severity: "error",
  }] };
}
