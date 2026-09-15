export type RecognitionStatus = "recognized" | "unsupported" | "unknown" | "invalid";

export type MatchMethod = "hash" | "structural-parsed" | "structural-hint" | "none";

export type AdventureImportIssueCode =
  | "pdf-header-missing"
  | "pdf-incorrect-password"
  | "pdf-parse-failed"
  | "zip-eocd-not-found"
  | "zip-zip64-unsupported"
  | "zip-encrypted-entries-unsupported"
  | "zip-wrong-act-slot";

export interface AdventureImportIssue {
  readonly code: AdventureImportIssueCode;
  readonly severity: "error" | "warning";
}
