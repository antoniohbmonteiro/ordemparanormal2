import type { AdventureDefinition, AdventureHandoutReference } from "../../core/adventure-import/adventure-definition";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import type { AdventureAssetLookup } from "../../adapters/foundry/adventure-asset-storage";
import { resolveAdventureAsset } from "./resolve-adventure-asset";
import {
  adventureFolderPlacementFlag, ensureAdventureFolder, hasAdventureFolderPlacement,
  type AdventureFolderPlacementFlag, type AdventureFolderPort,
} from "./adventure-folders";

export const HANDOUT_IMPORTER = "handout";
export const HANDOUT_IMPORT_VERSION = 1;

export interface HandoutImportIdentity {
  readonly importer: typeof HANDOUT_IMPORTER;
  readonly adventureId: string;
  readonly documentId: string;
}

export interface HandoutImportMetadata {
  readonly version: number;
  readonly act: AdventureAct;
  readonly assetId: string;
}

export type HandoutImportFlag = HandoutImportIdentity & HandoutImportMetadata;

export interface HandoutPageSnapshot {
  readonly id: string;
  readonly flag: unknown;
  readonly type: string;
  readonly src: string | null;
}

export interface HandoutJournalSnapshot {
  readonly id: string;
  readonly flag: unknown;
  readonly folderId?: string | null;
  readonly folderPlacement?: unknown;
  readonly pages: readonly HandoutPageSnapshot[];
}

export interface HandoutJournalPort {
  isAuthorized(): boolean;
  listJournals(): readonly HandoutJournalSnapshot[];
  createJournal(handout: AdventureHandoutReference, storedPath: string, folderId: string, flag: HandoutImportFlag,
    folderPlacement: AdventureFolderPlacementFlag): Promise<string>;
  updateFolderPlacement(journalId: string, folderId: string | null, flag: AdventureFolderPlacementFlag): Promise<void>;
  updateJournalMetadata(journalId: string, metadata: HandoutImportMetadata): Promise<void>;
  createPage(journalId: string, name: string, type: "image" | "pdf", src: string, flag: HandoutImportFlag): Promise<void>;
  updatePage(journalId: string, pageId: string, type: "image" | "pdf", src: string, metadata: HandoutImportMetadata): Promise<void>;
}

export type HandoutImportStage = "preflight" | "folder" | "journal" | "page";
export type HandoutImportFailure = "invalid-definition" | "missing-asset" | "conflict" | "unauthorized" | "busy" | "operation-failed";

export interface HandoutImportCounts {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
}

export class HandoutImportError extends Error {
  constructor(
    readonly code: HandoutImportFailure,
    readonly stage: HandoutImportStage,
    readonly act: AdventureAct | null,
    readonly documentId: string | null,
    readonly counts: HandoutImportCounts,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HandoutImportError";
  }
}

export interface ImportAdventureHandoutsInput {
  readonly definition: AdventureDefinition;
  readonly acts: readonly AdventureAct[];
  readonly lookup: AdventureAssetLookup;
  readonly journals: HandoutJournalPort;
  readonly folders: AdventureFolderPort;
  readonly onProgress?: (completed: number, total: number) => void | Promise<void>;
}

interface PreparedHandout {
  readonly handout: AdventureHandoutReference;
  readonly storedPath: string;
}

const emptyCounts = (): HandoutImportCounts => ({ created: 0, updated: 0, unchanged: 0 });
const flagFor = (adventureId: string, handout: AdventureHandoutReference): HandoutImportFlag => ({
  importer: HANDOUT_IMPORTER,
  adventureId,
  documentId: handout.id,
  version: HANDOUT_IMPORT_VERSION,
  act: handout.act,
  assetId: handout.assetId,
});

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function identity(value: unknown): HandoutImportIdentity | null {
  const data = record(value);
  return data?.importer === HANDOUT_IMPORTER && typeof data.adventureId === "string"
    && typeof data.documentId === "string"
    ? { importer: HANDOUT_IMPORTER, adventureId: data.adventureId, documentId: data.documentId }
    : null;
}

function metadataMatches(value: unknown, expected: HandoutImportMetadata): boolean {
  const data = record(value);
  return data?.version === expected.version && data.act === expected.act && data.assetId === expected.assetId;
}

function fail(
  code: HandoutImportFailure, stage: HandoutImportStage, act: AdventureAct | null,
  documentId: string | null, counts: HandoutImportCounts, message: string, cause?: unknown,
): never {
  throw new HandoutImportError(code, stage, act, documentId, counts, message,
    cause === undefined ? undefined : { cause });
}

export function validateHandoutDefinition(definition: AdventureDefinition): readonly string[] {
  const issues: string[] = [];
  const assetIds = new Set<string>();
  const assets = new Map<string, AdventureDefinition["assets"][number]>();
  for (const asset of definition.assets) {
    if (!asset.id || assets.has(asset.id)) issues.push(`Duplicate or empty asset ID: ${asset.id}`);
    assets.set(asset.id, asset);
  }
  const documentIds = new Set<string>();
  for (const handout of definition.handouts) {
    if (!handout.id || documentIds.has(handout.id)) issues.push(`Duplicate or empty handout ID: ${handout.id}`);
    documentIds.add(handout.id);
    if (!handout.assetId || assetIds.has(handout.assetId)) issues.push(`Duplicate or empty handout asset: ${handout.assetId}`);
    assetIds.add(handout.assetId);
    const asset = assets.get(handout.assetId);
    const extension = asset?.source.originalEntryPath.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
    const expectedType = extension === "pdf" ? "pdf" : extension === "jpg" || extension === "jpeg" || extension === "png" ? "image" : null;
    if (!asset || asset.kind !== "handout" || asset.source.act !== handout.act
      || expectedType !== handout.pageType || !handout.label.trim()) {
      issues.push(`Invalid handout reference: ${handout.id}`);
    }
  }
  for (const asset of definition.assets) {
    if (asset.kind === "handout" && !assetIds.has(asset.id)) issues.push(`Unmapped handout asset: ${asset.id}`);
  }
  return issues;
}

function selectedActs(acts: readonly AdventureAct[]): readonly AdventureAct[] {
  if (acts.length === 0 || new Set(acts).size !== acts.length
    || acts.some((act) => act !== "actOne" && act !== "actTwo")) {
    fail("invalid-definition", "preflight", null, null, emptyCounts(), "Select one or two distinct supported Acts");
  }
  return acts;
}

function preflightDocuments(
  adventureId: string, selected: readonly AdventureHandoutReference[], port: HandoutJournalPort,
): void {
  const selectedIds = new Set(selected.map((handout) => handout.id));
  const seen = new Set<string>();
  for (const journal of port.listJournals()) {
    const data = record(journal.flag);
    if (data?.importer !== HANDOUT_IMPORTER || data.adventureId !== adventureId) continue;
    const journalIdentity = identity(journal.flag);
    if (!journalIdentity) fail("conflict", "preflight", null, null, emptyCounts(), `Malformed imported Journal: ${journal.id}`);
    if (!selectedIds.has(journalIdentity.documentId)) continue;
    if (seen.has(journalIdentity.documentId)) {
      fail("conflict", "preflight", null, journalIdentity.documentId, emptyCounts(), "Duplicate imported Journal identity");
    }
    seen.add(journalIdentity.documentId);
    let managedPages = 0;
    for (const page of journal.pages) {
      const pageData = record(page.flag);
      if (pageData?.importer !== HANDOUT_IMPORTER) continue;
      const pageIdentity = identity(page.flag);
      if (!pageIdentity || pageIdentity.adventureId !== adventureId
        || pageIdentity.documentId !== journalIdentity.documentId) {
        fail("conflict", "preflight", null, journalIdentity.documentId, emptyCounts(), "Page provenance targets another identity");
      }
      managedPages++;
    }
    if (managedPages > 1) {
      fail("conflict", "preflight", null, journalIdentity.documentId, emptyCounts(), "Multiple managed pages in one Journal");
    }
    const handout = selected.find(candidate => candidate.id === journalIdentity.documentId)!;
    hasAdventureFolderPlacement(journal.folderPlacement, adventureFolderPlacementFlag({ adventureId,
      documentType: "JournalEntry", documentId: handout.id, act: handout.act }));
  }
}

function importedJournal(
  adventureId: string, documentId: string, port: HandoutJournalPort, counts: HandoutImportCounts,
): HandoutJournalSnapshot | null {
  const matches = port.listJournals().filter((journal) => {
    const found = identity(journal.flag);
    return found?.adventureId === adventureId && found.documentId === documentId;
  });
  if (matches.length > 1) fail("conflict", "journal", null, documentId, counts, "Duplicate imported Journal identity");
  return matches[0] ?? null;
}

let importRunning = false;

export async function importAdventureHandouts(input: ImportAdventureHandoutsInput): Promise<HandoutImportCounts> {
  const { definition, lookup, journals, folders: folderPort } = input;
  if (importRunning) fail("busy", "preflight", null, null, emptyCounts(), "A handout import is already running");
  importRunning = true;
  let counts = emptyCounts();
  try {
    if (!journals.isAuthorized()) fail("unauthorized", "preflight", null, null, counts, "Only the active GM may import handouts");
    const acts = selectedActs(input.acts);
    const issues = validateHandoutDefinition(definition);
    if (issues.length > 0) fail("invalid-definition", "preflight", null, null, counts, issues.join("; "));
    const selected = definition.handouts.filter((handout) => acts.includes(handout.act));
    const prepared: PreparedHandout[] = [];
    for (const handout of selected) {
      try {
        prepared.push({ handout, storedPath: await resolveAdventureAsset(definition, handout.assetId, {
          kind: "worldStorage", lookup,
        }) });
      } catch (cause) {
        fail("missing-asset", "preflight", handout.act, handout.id, counts, `Cannot resolve stored asset: ${handout.assetId}`, cause);
      }
    }
    preflightDocuments(definition.id, selected, journals);
    const folders = new Map<AdventureAct, string>();
    try {
      for (const act of acts) if (selected.some(handout => handout.act === act)) {
        folders.set(act, await ensureAdventureFolder({ adventureId: definition.id, documentType: "JournalEntry", act, folders: folderPort }));
      }
    } catch (cause) {
      fail("operation-failed", "folder", null, null, counts, "Falha ao garantir as pastas de Handouts", cause);
    }
    try {
      await input.onProgress?.(0, prepared.length);
    } catch (cause) {
      fail("operation-failed", "preflight", null, null, counts, "Failed to report import progress", cause);
    }
    let completed = 0;
    for (const { handout, storedPath } of prepared) {
      if (!journals.isAuthorized()) fail("unauthorized", "journal", handout.act, handout.id, counts, "Active GM changed");
      const flag = flagFor(definition.id, handout);
      const placement = adventureFolderPlacementFlag({ adventureId: definition.id, documentType: "JournalEntry",
        documentId: handout.id, act: handout.act });
      let journal = importedJournal(definition.id, handout.id, journals, counts);
      if (!journal) {
        journal = importedJournal(definition.id, handout.id, journals, counts);
        if (!journal) {
          try {
            await journals.createJournal(handout, storedPath, folders.get(handout.act)!, flag, placement);
          } catch (cause) {
            fail("operation-failed", "journal", handout.act, handout.id, counts, "Failed to create Journal", cause);
          }
          counts = { ...counts, created: counts.created + 1 };
          completed++;
          try {
            await input.onProgress?.(completed, prepared.length);
          } catch (cause) {
            fail("operation-failed", "journal", handout.act, handout.id, counts, "Failed to report confirmed import progress", cause);
          }
          continue;
        }
      }
      try {
        if (!hasAdventureFolderPlacement(journal.folderPlacement, placement)) {
          await journals.updateFolderPlacement(journal.id, journal.folderId ?? null, placement);
          journal = importedJournal(definition.id, handout.id, journals, counts)!;
        }
      } catch (cause) {
        fail("conflict", "folder", handout.act, handout.id, counts, "Falha ao normalizar a organização do Handout", cause);
      }
      const page = journal.pages.find((candidate) => {
        const found = identity(candidate.flag);
        return found?.adventureId === definition.id && found.documentId === handout.id;
      });
      let changed = !metadataMatches(journal.flag, flag);
      try {
        if (changed) await journals.updateJournalMetadata(journal.id, flag);
        if (!page) {
          await journals.createPage(journal.id, handout.label, handout.pageType, storedPath, flag);
          changed = true;
        } else if (page.type !== handout.pageType || page.src !== storedPath || !metadataMatches(page.flag, flag)) {
          await journals.updatePage(journal.id, page.id, handout.pageType, storedPath, flag);
          changed = true;
        }
      } catch (cause) {
        fail("operation-failed", "page", handout.act, handout.id, counts, "Failed to reconcile imported Journal", cause);
      }
      counts = changed ? { ...counts, updated: counts.updated + 1 } : { ...counts, unchanged: counts.unchanged + 1 };
      completed++;
      try {
        await input.onProgress?.(completed, prepared.length);
      } catch (cause) {
        fail("operation-failed", "page", handout.act, handout.id, counts, "Failed to report confirmed import progress", cause);
      }
    }
    return counts;
  } finally {
    importRunning = false;
  }
}
