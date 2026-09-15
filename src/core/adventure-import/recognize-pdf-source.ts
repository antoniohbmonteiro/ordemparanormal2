import type {
  KnownPdfEdition,
  KnownPdfEncryptionProfile,
  KnownPdfStructuralDescriptor,
  PdfEditionId,
} from "./known-adventure-sources";
import type { PdfEncryptionFacts, PdfParseAttempt, PdfParsedFacts, PdfPrePasswordFacts } from "./pdf-source-facts";
import type { AdventureImportIssue, MatchMethod, RecognitionStatus } from "./recognition-status";

export interface PdfSourceAnalysis {
  readonly status: RecognitionStatus;
  readonly passwordRequired: boolean;
  readonly matchMethod: MatchMethod;
  readonly edition: PdfEditionId | null;
  readonly facts: { readonly pre: PdfPrePasswordFacts; readonly parseAttempt: PdfParseAttempt };
  readonly issues: readonly AdventureImportIssue[];
}

function matchesEncryptionProfile(
  encryption: PdfEncryptionFacts,
  profile: KnownPdfEncryptionProfile,
): boolean {
  return (
    encryption.v === profile.v &&
    encryption.r === profile.r &&
    encryption.length === profile.length &&
    encryption.streamFilter === profile.streamFilter &&
    encryption.stringFilter === profile.stringFilter
  );
}

function matchesStructuralDescriptor(
  facts: PdfParsedFacts,
  descriptor: KnownPdfStructuralDescriptor,
): boolean {
  const checks: boolean[] = [];

  if (descriptor.producer !== undefined) checks.push(facts.producer === descriptor.producer);
  if (descriptor.creator !== undefined) checks.push(facts.creator === descriptor.creator);
  if (descriptor.lang !== undefined) checks.push(facts.lang === descriptor.lang);
  if (descriptor.versionStampPattern !== undefined) {
    checks.push(descriptor.versionStampPattern.test(facts.versionStampTag ?? ""));
  }
  if (descriptor.pageCount !== undefined) checks.push(facts.pageCount === descriptor.pageCount);

  return checks.length > 0 && checks.every(Boolean);
}

function findEditionByHash(
  sha256: string,
  knownEditions: Record<PdfEditionId, KnownPdfEdition>,
): PdfEditionId | null {
  const entry = (Object.entries(knownEditions) as [PdfEditionId, KnownPdfEdition][]).find(
    ([, edition]) => edition.sha256 === sha256,
  );
  return entry ? entry[0] : null;
}

function findEditionByStructuralDescriptor(
  facts: PdfParsedFacts,
  knownEditions: Record<PdfEditionId, KnownPdfEdition>,
): PdfEditionId | null {
  const matches = (Object.entries(knownEditions) as [PdfEditionId, KnownPdfEdition][]).filter(([, edition]) =>
    matchesStructuralDescriptor(facts, edition.structural),
  );
  return matches.length === 1 ? matches[0][0] : null;
}

function hasEncryptionProfileHint(
  encryption: PdfEncryptionFacts,
  knownEditions: Record<PdfEditionId, KnownPdfEdition>,
): boolean {
  if (!encryption.present) return false;
  return Object.values(knownEditions).some(
    (edition) => edition.encryptionProfile !== undefined && matchesEncryptionProfile(encryption, edition.encryptionProfile),
  );
}

const PASSWORD_REQUIRED_BY_STATUS: Record<PdfParseAttempt["status"], boolean> = {
  "not-attempted": true,
  "password-required": true,
  "incorrect-password": true,
  success: false,
  failed: false,
};

export function recognizePdfSource(
  pre: PdfPrePasswordFacts,
  parseAttempt: PdfParseAttempt,
  knownEditions: Record<PdfEditionId, KnownPdfEdition>,
): PdfSourceAnalysis {
  if (pre.pdfVersion === null) {
    return {
      status: "invalid",
      passwordRequired: false,
      matchMethod: "none",
      edition: null,
      facts: { pre, parseAttempt },
      issues: [{ code: "pdf-header-missing", severity: "error" }],
    };
  }

  const passwordRequired = PASSWORD_REQUIRED_BY_STATUS[parseAttempt.status];
  const issues: AdventureImportIssue[] = [];
  if (parseAttempt.status === "incorrect-password") {
    issues.push({ code: "pdf-incorrect-password", severity: "warning" });
  } else if (parseAttempt.status === "failed") {
    issues.push({ code: "pdf-parse-failed", severity: "error" });
  }

  const hashEdition = findEditionByHash(pre.sha256, knownEditions);
  if (hashEdition !== null) {
    return {
      status: "recognized",
      passwordRequired,
      matchMethod: "hash",
      edition: hashEdition,
      facts: { pre, parseAttempt },
      issues,
    };
  }

  if (parseAttempt.status === "success") {
    const structuralEdition = findEditionByStructuralDescriptor(parseAttempt.facts, knownEditions);
    if (structuralEdition !== null) {
      return {
        status: "recognized",
        passwordRequired,
        matchMethod: "structural-parsed",
        edition: structuralEdition,
        facts: { pre, parseAttempt },
        issues,
      };
    }
    return {
      status: "unknown",
      passwordRequired,
      matchMethod: "none",
      edition: null,
      facts: { pre, parseAttempt },
      issues,
    };
  }

  const preParseHintEligible =
    parseAttempt.status === "not-attempted" ||
    parseAttempt.status === "password-required" ||
    parseAttempt.status === "incorrect-password";

  const matchMethod: MatchMethod =
    preParseHintEligible && hasEncryptionProfileHint(pre.encryption, knownEditions) ? "structural-hint" : "none";

  return {
    status: "unknown",
    passwordRequired,
    matchMethod,
    edition: null,
    facts: { pre, parseAttempt },
    issues,
  };
}
