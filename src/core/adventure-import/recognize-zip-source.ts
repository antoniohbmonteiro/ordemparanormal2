import { ZIP_PACKAGE_BY_ACT, type KnownZipPackage, type ZipPackageId } from "./known-adventure-sources";
import type { AdventureImportIssue, MatchMethod, RecognitionStatus } from "./recognition-status";
import { normalizeZipFileEntries } from "./zip-fingerprint";
import type { ZipCentralDirectoryEntry } from "./zip-central-directory-entry";

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

export function recognizeZipSource(
  entries: readonly ZipCentralDirectoryEntry[],
  fingerprintHash: string,
  act: AdventureAct,
  knownPackages: Record<ZipPackageId, KnownZipPackage>,
  adapterIssues: readonly AdventureImportIssue[] = [],
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

  const inventory = buildInventory(entries);

  const ownPackageId = ZIP_PACKAGE_BY_ACT[act];
  if (fingerprintHash === knownPackages[ownPackageId].fingerprintHash) {
    return {
      act,
      status: "recognized",
      matchMethod: "hash",
      edition: ownPackageId,
      inventory,
      issues: adapterIssues,
    };
  }

  const otherPackageId = ZIP_PACKAGE_BY_ACT[otherAct(act)];
  if (fingerprintHash === knownPackages[otherPackageId].fingerprintHash) {
    return {
      act,
      status: "unsupported",
      matchMethod: "hash",
      edition: otherPackageId,
      inventory,
      issues: [...adapterIssues, { code: "zip-wrong-act-slot", severity: "warning" }],
    };
  }

  return {
    act,
    status: "unknown",
    matchMethod: "none",
    edition: null,
    inventory,
    issues: adapterIssues,
  };
}
