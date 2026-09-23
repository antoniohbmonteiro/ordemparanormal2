export type RecognitionStatus = "recognized" | "unsupported" | "unknown" | "invalid";

export type MatchMethod = "hash" | "content" | "structural" | "structural-hint" | "none";

export type AdventureImportIssueCode =
  | "pdf-header-missing"
  | "pdf-incorrect-password"
  | "pdf-parse-failed"
  | "zip-eocd-not-found"
  | "zip-zip64-unsupported"
  | "zip-encrypted-entries-unsupported"
  | "zip-invalid-entries"
  | "zip-wrong-act-slot"
  | "zip-supplemental-missing"
  | "zip-supplemental-mismatch"
  | "zip-required-mismatch"
  | "zip-content-mismatch"
  | "zip-unexpected-payload";

export interface AdventureImportIssue {
  readonly code: AdventureImportIssueCode;
  readonly severity: "error" | "warning";
  readonly path?: string;
}
