import { describe, expect, it, vi } from "vitest";
import type { AdventureDefinition } from "../../core/adventure-import/adventure-definition";
import type { AdventureAssetLookup } from "../../adapters/foundry/adventure-asset-storage";
import {
  HANDOUT_IMPORTER, importAdventureHandouts, validateHandoutDefinition,
  type HandoutFolderFlag, type HandoutFolderSnapshot, type HandoutImportFlag,
  type HandoutImportMetadata, type HandoutJournalPort, type HandoutJournalSnapshot,
} from "./import-adventure-handouts";

const definition: AdventureDefinition = {
  id: "playtest-alpha",
  packageIds: { actOne: "ato-i-extras", actTwo: "ato-ii-extras" },
  assets: [
    { id: "one.image", kind: "handout", label: "Imagem", source: { act: "actOne", originalEntryPath: "Handouts/a.png" } },
    { id: "two.pdf", kind: "handout", label: "PDF", source: { act: "actTwo", originalEntryPath: "Handouts/b.pdf" } },
  ],
  handouts: [
    { id: "one", act: "actOne", assetId: "one.image", label: "Handout 01", pageType: "image" },
    { id: "two", act: "actTwo", assetId: "two.pdf", label: "Handout 01", pageType: "pdf" },
  ],
};

function lookup(): AdventureAssetLookup & { findExisting: ReturnType<typeof vi.fn> } {
  return {
    worldId: "test-world",
    findExisting: vi.fn(async (_directory: string, basename: string) =>
      `worlds/test-world/handouts/${basename}`),
  };
}

class FakePort implements HandoutJournalPort {
  authorized = true;
  readonly journals: HandoutJournalSnapshot[] = [];
  readonly folders: HandoutFolderSnapshot[] = [];
  journalCreates = 0;
  failJournalAt = -1;
  readonly created: { label: string; src: string; pageType: string }[] = [];
  isAuthorized(): boolean { return this.authorized; }
  listJournals(): readonly HandoutJournalSnapshot[] { return this.journals; }
  listFolders(): readonly HandoutFolderSnapshot[] { return this.folders; }
  async createFolder(_name: string, _parentId: string | null, flag: HandoutFolderFlag): Promise<string> {
    const id = `folder-${this.folders.length + 1}`;
    this.folders.push({ id, type: "JournalEntry", flag });
    return id;
  }
  async createJournal(handout: AdventureDefinition["handouts"][number], storedPath: string, _folderId: string, flag: HandoutImportFlag): Promise<string> {
    this.journalCreates++;
    if (this.journalCreates === this.failJournalAt) throw new Error("database failed");
    const id = `journal-${this.journals.length + 1}`;
    this.journals.push({ id, flag, pages: [{ id: `page-${id}`, flag, type: handout.pageType, src: storedPath }] });
    this.created.push({ label: handout.label, src: storedPath, pageType: handout.pageType });
    return id;
  }
  async updateJournalMetadata(journalId: string, metadata: HandoutImportMetadata): Promise<void> {
    const index = this.journals.findIndex((journal) => journal.id === journalId);
    this.journals[index] = { ...this.journals[index], flag: { ...this.journals[index].flag as object, ...metadata } };
  }
  async createPage(journalId: string, _name: string, type: "image" | "pdf", src: string, flag: HandoutImportFlag): Promise<void> {
    const index = this.journals.findIndex((journal) => journal.id === journalId);
    this.journals[index] = { ...this.journals[index], pages: [
      ...this.journals[index].pages, { id: `repair-${journalId}`, flag, type, src },
    ] };
  }
  async updatePage(journalId: string, pageId: string, type: "image" | "pdf", src: string, metadata: HandoutImportMetadata): Promise<void> {
    const index = this.journals.findIndex((journal) => journal.id === journalId);
    this.journals[index] = { ...this.journals[index], pages: this.journals[index].pages.map((page) => page.id === pageId
      ? { ...page, type, src, flag: { ...page.flag as object, ...metadata } } : page) };
  }
}

const importedFlag = (documentId: string): HandoutImportFlag => ({
  importer: HANDOUT_IMPORTER, adventureId: "playtest-alpha", documentId,
  version: 1, act: documentId === "one" ? "actOne" : "actTwo",
  assetId: documentId === "one" ? "one.image" : "two.pdf",
});

describe("handout import", () => {
  it("rejects missing, duplicate, cross-Act and wrong-type mappings", () => {
    expect(validateHandoutDefinition(definition)).toEqual([]);
    expect(validateHandoutDefinition({ ...definition, handouts: definition.handouts.slice(0, 1) }))
      .toContain("Unmapped handout asset: two.pdf");
    expect(validateHandoutDefinition({ ...definition, handouts: [definition.handouts[0], definition.handouts[0], definition.handouts[1]] }))
      .toContain("Duplicate or empty handout ID: one");
    expect(validateHandoutDefinition({ ...definition, handouts: [{ ...definition.handouts[0], act: "actTwo", pageType: "pdf" }, definition.handouts[1]] }))
      .toContain("Invalid handout reference: one");
  });

  it("preflights all selected stored assets before creating any Folder or Journal", async () => {
    const port = new FakePort();
    const storage = lookup();
    storage.findExisting.mockResolvedValueOnce("worlds/test-world/handouts/a.png").mockResolvedValueOnce(null);
    await expect(importAdventureHandouts({ definition, acts: ["actOne", "actTwo"], lookup: storage, journals: port }))
      .rejects.toMatchObject({ code: "missing-asset", stage: "preflight", act: "actTwo", documentId: "two" });
    expect(port.folders).toEqual([]);
    expect(port.journals).toEqual([]);
  });

  it("imports only selected Acts, keeps manual homonyms, and reimports without changes", async () => {
    const port = new FakePort();
    const storage = lookup();
    port.journals.push({ id: "manual", flag: null, pages: [{ id: "manual-page", flag: null, type: "text", src: null }] });
    port.folders.push({ id: "manual-folder", type: "JournalEntry", flag: null });
    expect(await importAdventureHandouts({ definition, acts: ["actOne"], lookup: storage, journals: port }))
      .toEqual({ created: 1, updated: 0, unchanged: 0 });
    expect(port.created).toEqual([{ label: "Handout 01", src: "worlds/test-world/handouts/a.png", pageType: "image" }]);
    expect(port.folders.map((folder) => folder.id)).toEqual(["manual-folder", "folder-2", "folder-3"]);
    expect(await importAdventureHandouts({ definition, acts: ["actOne"], lookup: storage, journals: port }))
      .toEqual({ created: 0, updated: 0, unchanged: 1 });
    expect(port.journals).toHaveLength(2);
    expect(await importAdventureHandouts({ definition, acts: ["actTwo"], lookup: storage, journals: port }))
      .toEqual({ created: 1, updated: 0, unchanged: 0 });
    expect(port.created[1]).toMatchObject({ pageType: "pdf", src: "worlds/test-world/handouts/b.pdf" });
    expect(port.folders).toHaveLength(4);
  });

  it("reconciles importer metadata and the managed page but preserves manual pages", async () => {
    const port = new FakePort();
    const old = { ...importedFlag("one"), version: 0, act: "actTwo" as const, assetId: "old-asset" };
    port.journals.push({ id: "imported", flag: old, pages: [
      { id: "managed", flag: old, type: "pdf", src: "old-path" },
      { id: "manual", flag: null, type: "text", src: null },
    ] });
    expect(await importAdventureHandouts({ definition, acts: ["actOne"], lookup: lookup(), journals: port }))
      .toEqual({ created: 0, updated: 1, unchanged: 0 });
    expect(port.journals[0].flag).toMatchObject(importedFlag("one"));
    expect(port.journals[0].pages[0]).toMatchObject({ type: "image", src: "worlds/test-world/handouts/a.png", flag: importedFlag("one") });
    expect(port.journals[0].pages[1]).toEqual({ id: "manual", flag: null, type: "text", src: null });
  });

  it("repairs a missing managed page without adopting an unmarked page", async () => {
    const port = new FakePort();
    port.journals.push({ id: "imported", flag: importedFlag("one"), pages: [
      { id: "manual", flag: null, type: "image", src: "manual.png" },
    ] });
    expect(await importAdventureHandouts({ definition, acts: ["actOne"], lookup: lookup(), journals: port }))
      .toEqual({ created: 0, updated: 1, unchanged: 0 });
    expect(port.journals[0].pages).toHaveLength(2);
    expect(port.journals[0].pages[0].src).toBe("manual.png");
    expect(port.journals[0].pages[1].flag).toMatchObject(importedFlag("one"));
  });

  it("stops on duplicated Journal identities or conflicting page provenance", async () => {
    const port = new FakePort();
    port.journals.push({ id: "first", flag: importedFlag("one"), pages: [] });
    port.journals.push({ id: "second", flag: importedFlag("one"), pages: [] });
    await expect(importAdventureHandouts({ definition, acts: ["actOne"], lookup: lookup(), journals: port }))
      .rejects.toMatchObject({ code: "conflict", stage: "preflight" });
    port.journals.pop();
    port.journals[0] = { ...port.journals[0], pages: [
      { id: "wrong", flag: importedFlag("two"), type: "pdf", src: "b.pdf" },
    ] };
    await expect(importAdventureHandouts({ definition, acts: ["actOne"], lookup: lookup(), journals: port }))
      .rejects.toMatchObject({ code: "conflict", stage: "preflight" });
    port.journals[0] = { ...port.journals[0], pages: [
      { id: "p1", flag: importedFlag("one"), type: "image", src: "a.png" },
      { id: "p2", flag: importedFlag("one"), type: "image", src: "a.png" },
    ] };
    await expect(importAdventureHandouts({ definition, acts: ["actOne"], lookup: lookup(), journals: port }))
      .rejects.toMatchObject({ code: "conflict", stage: "preflight" });
  });

  it("reports confirmed progress and resumes deterministically after a partial database failure", async () => {
    const port = new FakePort();
    port.failJournalAt = 2;
    const storage = lookup();
    await expect(importAdventureHandouts({ definition, acts: ["actOne", "actTwo"], lookup: storage, journals: port }))
      .rejects.toMatchObject({ code: "operation-failed", stage: "journal", act: "actTwo", documentId: "two", counts: { created: 1 } });
    expect(port.journals).toHaveLength(1);
    port.failJournalAt = -1;
    expect(await importAdventureHandouts({ definition, acts: ["actOne", "actTwo"], lookup: storage, journals: port }))
      .toEqual({ created: 1, updated: 0, unchanged: 1 });
    expect(port.journals).toHaveLength(2);
  });

  it("requires the active GM before browsing storage or writing Documents", async () => {
    const port = new FakePort();
    port.authorized = false;
    const storage = lookup();
    await expect(importAdventureHandouts({ definition, acts: ["actOne"], lookup: storage, journals: port }))
      .rejects.toMatchObject({ code: "unauthorized", stage: "preflight" });
    expect(storage.findExisting).not.toHaveBeenCalled();
  });
});
