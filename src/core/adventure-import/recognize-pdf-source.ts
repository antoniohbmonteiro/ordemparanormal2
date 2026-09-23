import type {
  KnownPdfEdition,
  KnownPdfEncryptionProfile,
  PdfDocumentVariant,
  PdfEditionId,
} from "./known-adventure-sources";
import type { PdfEncryptionFacts, PdfParseAttempt, PdfParsedFacts, PdfPrePasswordFacts } from "./pdf-source-facts";
import type { AdventureImportIssue, MatchMethod, RecognitionStatus } from "./recognition-status";

export interface PdfSourceAnalysis {
  readonly status: RecognitionStatus;
  readonly passwordRequired: boolean;
  readonly matchMethod: MatchMethod;
  readonly edition: PdfEditionId | null;
  readonly variant: PdfDocumentVariant | null;
  readonly supportedActs: readonly ("actOne" | "actTwo")[];
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

function matchesContentSignature(facts: PdfParsedFacts, edition: KnownPdfEdition): boolean {
  return edition.contentSignatureSha256 !== undefined
    && facts.contentSignatureSha256 === edition.contentSignatureSha256
    && edition.structural.pageCount !== undefined
    && facts.pageCount === edition.structural.pageCount
    && edition.structural.versionStampPattern !== undefined
    && edition.structural.versionStampPattern.test(facts.versionStampTag ?? "");
}

function findEditionByHash(
  sha256: string,
  knownEditions: Readonly<Record<string, KnownPdfEdition>>,
): KnownPdfEdition | null {
  return Object.values(knownEditions).find((document) => document.sha256Hashes.includes(sha256)) ?? null;
}

function findEditionByContentSignature(
  facts: PdfParsedFacts,
  knownEditions: Readonly<Record<string, KnownPdfEdition>>,
): KnownPdfEdition | null {
  const matches = Object.values(knownEditions).filter((document) => matchesContentSignature(facts, document));
  return matches.length === 1 ? matches[0] : null;
}

function hasEncryptionProfileHint(
  encryption: PdfEncryptionFacts,
  knownEditions: Readonly<Record<string, KnownPdfEdition>>,
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
  knownEditions: Readonly<Record<string, KnownPdfEdition>>,
): PdfSourceAnalysis {
  if (pre.pdfVersion === null) {
    return {
      status: "invalid",
      passwordRequired: false,
      matchMethod: "none",
      edition: null,
      variant: null, supportedActs: [],
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

  const hashDocument = findEditionByHash(pre.sha256, knownEditions);
  if (hashDocument !== null) {
    return {
      status: "recognized",
      passwordRequired,
      matchMethod: "hash",
      edition: hashDocument.edition, variant: hashDocument.variant, supportedActs: hashDocument.supportedActs,
      facts: { pre, parseAttempt },
      issues,
    };
  }

  if (parseAttempt.status === "success") {
    const contentDocument = findEditionByContentSignature(parseAttempt.facts, knownEditions);
    if (contentDocument !== null) {
      return {
        status: "recognized",
        passwordRequired,
        matchMethod: "content",
        edition: contentDocument.edition, variant: contentDocument.variant, supportedActs: contentDocument.supportedActs,
        facts: { pre, parseAttempt },
        issues,
      };
    }
    return {
      status: "unknown",
      passwordRequired,
      matchMethod: "none",
      edition: null,
      variant: null, supportedActs: [],
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
    variant: null, supportedActs: [],
    facts: { pre, parseAttempt },
    issues,
  };
}
