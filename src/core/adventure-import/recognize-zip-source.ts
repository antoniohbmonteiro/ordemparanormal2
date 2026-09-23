import { ZIP_PACKAGE_BY_ACT, type KnownZipPackage, type ZipPackageId } from "./known-adventure-sources";
import type { AdventureImportIssue, MatchMethod, RecognitionStatus } from "./recognition-status";
import { normalizeZipFileEntries } from "./zip-fingerprint";
import type { ZipCentralDirectoryEntry } from "./zip-central-directory-entry";
import { validateZipRawEntries, type CanonicalZipPayloadEntry } from "./zip-structural-manifest";

export type AdventureAct = "actOne" | "actTwo";

export interface ZipInventorySummary {
  readonly totalFiles: number;
  readonly totalBytes: number;
  readonly topLevelFolders: readonly { readonly name: string; readonly fileCount: number }[];
}

export interface ZipSourceAnalysis {
  readonly act: AdventureAct;
  readonly status: RecognitionStatus;
  readonly matchMethod: MatchMethod;
  readonly edition: ZipPackageId | null;
  readonly inventory: ZipInventorySummary | null;
  readonly issues: readonly AdventureImportIssue[];
  readonly missingSupplementalPaths?: readonly string[];
}

export interface ZipStructuralSignature {
  readonly manifestHash: string;
  readonly fileCount: number;
  readonly entries: readonly CanonicalZipPayloadEntry[];
  readonly identityManifestHashes?: Readonly<Partial<Record<ZipPackageId, string>>>;
  readonly contentManifestHash?: string;
  readonly contentShaByPath?: ReadonlyMap<string, string>;
}

function otherAct(act: AdventureAct): AdventureAct {
  return act === "actOne" ? "actTwo" : "actOne";
}

function buildInventory(entries: readonly ZipCentralDirectoryEntry[]): ZipInventorySummary {
  const fileEntries = normalizeZipFileEntries(entries);

  const folderCounts = new Map<string, number>();
  for (const entry of fileEntries) {
    const slashIndex = entry.path.indexOf("/");
    const folderName = slashIndex === -1 ? entry.path : entry.path.slice(0, slashIndex);
    folderCounts.set(folderName, (folderCounts.get(folderName) ?? 0) + 1);
  }

  return {
    totalFiles: fileEntries.length,
    totalBytes: fileEntries.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
    topLevelFolders: [...folderCounts.entries()].map(([name, fileCount]) => ({ name, fileCount })),
  };
}

export function identityPayload(entries: readonly CanonicalZipPayloadEntry[], pkg: KnownZipPackage): readonly CanonicalZipPayloadEntry[] {
  const supplemental = new Set(pkg.supplemental?.map((entry) => entry.path) ?? []);
  return entries.filter((entry) => !supplemental.has(entry.path));
}

function supplementalMetadataMatches(entries: readonly CanonicalZipPayloadEntry[], pkg: KnownZipPackage): boolean {
  return (pkg.supplemental ?? []).every((expected) => {
    const actual = entries.find((entry) => entry.path === expected.path);
    return !actual || (actual.uncompressedSize === expected.uncompressedSize && actual.crc32 === expected.crc32);
  });
}

export function isStructuralCandidate(pkgId: ZipPackageId, pkg: KnownZipPackage, signature: ZipStructuralSignature | null): boolean {
  if (!signature || !pkg.identity || !pkg.anchors || !supplementalMetadataMatches(signature.entries, pkg)) return false;
  const required = identityPayload(signature.entries, pkg);
  if (required.length !== pkg.identity.expectedFileCount
    || signature.identityManifestHashes?.[pkgId] !== pkg.identity.structuralManifestHash) return false;
  if (!pkg.anchors.every((anchor) => required.some((entry) =>
    entry.path === anchor.path && entry.uncompressedSize === anchor.uncompressedSize && entry.crc32 === anchor.crc32
  ))) return false;
  const complete = (pkg.supplemental ?? []).every((expected) => signature.entries.some((entry) => entry.path === expected.path));
  return !complete || (signature.manifestHash === pkg.structuralManifestHash && signature.fileCount === pkg.expectedFileCount);
}

function matchesStructuralSignature(pkgId: ZipPackageId, pkg: KnownZipPackage, signature: ZipStructuralSignature | null): boolean {
  if (!isStructuralCandidate(pkgId, pkg, signature) || !pkg.identity?.contentManifestHash
    || signature?.contentManifestHash !== pkg.identity.contentManifestHash) return false;
  return (pkg.supplemental ?? []).every((expected) => {
    const present = signature.entries.some((entry) => entry.path === expected.path);
    return !present || signature.contentShaByPath?.get(expected.path) === expected.contentSha256;
  });
}

function supplementalIssues(pkg: KnownZipPackage, entries: readonly CanonicalZipPayloadEntry[] | null): AdventureImportIssue[] {
  if (!entries) return [];
  return (pkg.supplemental ?? []).flatMap((expected) => entries.some((entry) => entry.path === expected.path)
    ? [] : [{ code: "zip-supplemental-missing" as const, severity: "warning" as const, path: expected.path }]);
}

function structuralMismatchIssues(pkg: KnownZipPackage, signature: ZipStructuralSignature | null): AdventureImportIssue[] {
  if (!signature || !pkg.requiredPaths) return [];
  const required = new Set(pkg.requiredPaths);
  const supplemental = new Map((pkg.supplemental ?? []).map((entry) => [entry.path, entry]));
  for (const entry of signature.entries) {
    const expected = supplemental.get(entry.path);
    if (expected && (expected.uncompressedSize !== entry.uncompressedSize || expected.crc32 !== entry.crc32)) {
      return [{ code: "zip-supplemental-mismatch", severity: "error", path: entry.path }];
    }
    if (!required.has(entry.path) && !expected) {
      return [{ code: "zip-unexpected-payload", severity: "error", path: entry.path }];
    }
  }
  const present = new Set(signature.entries.map((entry) => entry.path));
  const missing = pkg.requiredPaths.find((path) => !present.has(path));
  if (missing) return [{ code: "zip-required-mismatch", severity: "error", path: missing }];
  return [{ code: "zip-required-mismatch", severity: "error" }];
}

export function recognizeZipSource(
  entries: readonly ZipCentralDirectoryEntry[],
  fingerprintHash: string,
  act: AdventureAct,
  knownPackages: Record<ZipPackageId, KnownZipPackage>,
  adapterIssues: readonly AdventureImportIssue[] = [],
  structuralSignature: ZipStructuralSignature | null = null,
): ZipSourceAnalysis {
  if (adapterIssues.some((issue) => issue.severity === "error")) {
    return {
      act,
      status: "invalid",
      matchMethod: "none",
      edition: null,
      inventory: null,
      issues: adapterIssues,
    };
  }

  try {
    validateZipRawEntries(entries);
  } catch {
    return {
      act, status: "invalid", matchMethod: "none", edition: null, inventory: null,
      issues: [...adapterIssues, { code: "zip-invalid-entries", severity: "error" }],
    };
  }

  const inventory = buildInventory(structuralSignature?.entries ?? entries);

  const ownPackageId = ZIP_PACKAGE_BY_ACT[act];
  const ownSupplementalIssues = supplementalIssues(knownPackages[ownPackageId], structuralSignature?.entries ?? null);
  if (knownPackages[ownPackageId].fingerprintHashes.includes(fingerprintHash)) {
    return {
      act,
      status: "recognized",
      matchMethod: "hash",
      edition: ownPackageId,
      inventory,
      issues: [...adapterIssues, ...ownSupplementalIssues],
      missingSupplementalPaths: ownSupplementalIssues.map((issue) => issue.path!),
    };
  }

  const otherPackageId = ZIP_PACKAGE_BY_ACT[otherAct(act)];
  if (knownPackages[otherPackageId].fingerprintHashes.includes(fingerprintHash)) {
    return {
      act,
      status: "unsupported",
      matchMethod: "hash",
      edition: otherPackageId,
      inventory,
      issues: [...adapterIssues, { code: "zip-wrong-act-slot", severity: "warning" }],
    };
  }

  if (matchesStructuralSignature(ownPackageId, knownPackages[ownPackageId], structuralSignature)) {
    return {
      act, status: "recognized", matchMethod: "structural", edition: ownPackageId,
      inventory, issues: [...adapterIssues, ...ownSupplementalIssues],
      missingSupplementalPaths: ownSupplementalIssues.map((issue) => issue.path!),
    };
  }
  if (matchesStructuralSignature(otherPackageId, knownPackages[otherPackageId], structuralSignature)) {
    return {
      act, status: "unsupported", matchMethod: "structural", edition: otherPackageId,
      inventory, issues: [...adapterIssues, { code: "zip-wrong-act-slot", severity: "warning" }],
    };
  }

  if (isStructuralCandidate(ownPackageId, knownPackages[ownPackageId], structuralSignature)
    && structuralSignature?.contentManifestHash !== undefined) {
    const changedSupplemental = knownPackages[ownPackageId].supplemental?.find((expected) =>
      structuralSignature.entries.some((entry) => entry.path === expected.path)
        && structuralSignature.contentShaByPath?.get(expected.path) !== expected.contentSha256);
    return { act, status: "unknown", matchMethod: "none", edition: null, inventory,
      issues: [...adapterIssues, changedSupplemental
        ? { code: "zip-supplemental-mismatch", severity: "error", path: changedSupplemental.path }
        : { code: "zip-content-mismatch", severity: "error" }] };
  }

  return {
    act,
    status: "unknown",
    matchMethod: "none",
    edition: null,
    inventory,
    issues: [...adapterIssues, ...structuralMismatchIssues(knownPackages[ownPackageId], structuralSignature)],
  };
}
