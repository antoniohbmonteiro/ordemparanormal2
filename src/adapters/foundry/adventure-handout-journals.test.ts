import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdventureHandoutJournalPort } from "./adventure-handout-journals";
import type { HandoutImportFlag } from "../../features/adventure-import/import-adventure-handouts";

const flag: HandoutImportFlag = {
  importer: "handout", adventureId: "playtest-alpha", documentId: "actTwo.handout.01.fillable",
  version: 1, act: "actTwo", assetId: "actTwo.handout.01.fillable",
};
const handout = {
  id: flag.documentId, act: flag.act, assetId: flag.assetId,
  label: "Handout 01 — preenchível", pageType: "pdf" as const,
};

const folderCreate = vi.fn();
const journalCreate = vi.fn();
const journalUpdate = vi.fn();
const createEmbeddedDocuments = vi.fn();
const updateEmbeddedDocuments = vi.fn();
const page = {
  id: "page-id", type: "pdf", src: "worlds/test/b.pdf",
  getFlag: vi.fn(() => flag),
};
const journal = {
  id: "journal-id", pages: { contents: [page] },
  getFlag: vi.fn(() => flag),
  update: journalUpdate,
  createEmbeddedDocuments,
  updateEmbeddedDocuments,
};
const folder = { id: "folder-id", type: "JournalEntry", getFlag: vi.fn(() => ({
  importer: "handout", adventureId: "playtest-alpha", folderId: "root", version: 1,
})) };

beforeEach(() => {
  folderCreate.mockReset().mockResolvedValue({ id: "new-folder" });
  journalCreate.mockReset().mockResolvedValue({ id: "new-journal" });
  journalUpdate.mockReset().mockResolvedValue(journal);
  createEmbeddedDocuments.mockReset().mockResolvedValue([{ id: "new-page" }]);
  updateEmbeddedDocuments.mockReset().mockResolvedValue([page]);
  vi.stubGlobal("foundry", { documents: {
    Folder: { create: folderCreate },
    JournalEntry: { create: journalCreate },
  } });
  vi.stubGlobal("game", {
    user: { isGM: true, id: "active-gm" }, users: { activeGM: { id: "active-gm" } },
    journal: { contents: [journal], get: vi.fn(() => journal) },
    folders: { contents: [folder] },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Foundry handout Journal adapter", () => {
  it("reads canonical flags from world Journals, pages and Folders", () => {
    const port = createAdventureHandoutJournalPort();
    expect(port.isAuthorized()).toBe(true);
    expect(port.listJournals()).toEqual([{
      id: "journal-id", flag,
      pages: [{ id: "page-id", flag, type: "pdf", src: "worlds/test/b.pdf" }],
    }]);
    expect(port.listFolders()[0]).toMatchObject({ id: "folder-id", type: "JournalEntry", flag: { folderId: "root" } });
    expect(journal.getFlag).toHaveBeenCalledWith("ordemparanormal2", "adventureImport");
    expect(page.getFlag).toHaveBeenCalledWith("ordemparanormal2", "adventureImport");
  });

  it("creates a native Journal folder and a PDF Journal with its managed page in one operation", async () => {
    const port = createAdventureHandoutJournalPort();
    expect(await port.createFolder("Ato II", "root-id", {
      importer: "handout", adventureId: "playtest-alpha", folderId: "actTwo", version: 1,
    })).toBe("new-folder");
    expect(folderCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: "Ato II", type: "JournalEntry", folder: "root-id",
      flags: { ordemparanormal2: { adventureImport: expect.objectContaining({ folderId: "actTwo" }) } },
    }));
    expect(await port.createJournal(handout, "worlds/test/b.pdf", "new-folder", flag)).toBe("new-journal");
    expect(journalCreate).toHaveBeenCalledWith({
      name: handout.label, folder: "new-folder",
      pages: [{ name: handout.label, type: "pdf", src: "worlds/test/b.pdf",
        flags: { ordemparanormal2: { adventureImport: flag } } }],
      flags: { ordemparanormal2: { adventureImport: flag } },
    });
  });

  it("updates only importer metadata and native page media fields, leaving user-owned fields untouched", async () => {
    const port = createAdventureHandoutJournalPort();
    await port.updateJournalMetadata("journal-id", flag);
    expect(journalUpdate).toHaveBeenCalledExactlyOnceWith({
      "flags.ordemparanormal2.adventureImport.version": 1,
      "flags.ordemparanormal2.adventureImport.act": "actTwo",
      "flags.ordemparanormal2.adventureImport.assetId": flag.assetId,
    });
    await port.updatePage("journal-id", "page-id", "pdf", "worlds/test/new.pdf", flag);
    expect(updateEmbeddedDocuments).toHaveBeenCalledExactlyOnceWith("JournalEntryPage", [{
      _id: "page-id", type: "pdf", src: "worlds/test/new.pdf",
      "flags.ordemparanormal2.adventureImport.version": 1,
      "flags.ordemparanormal2.adventureImport.act": "actTwo",
      "flags.ordemparanormal2.adventureImport.assetId": flag.assetId,
    }]);
    await port.createPage("journal-id", handout.label, "pdf", "worlds/test/b.pdf", flag);
    expect(createEmbeddedDocuments).toHaveBeenCalledExactlyOnceWith("JournalEntryPage", [{
      name: handout.label, type: "pdf", src: "worlds/test/b.pdf",
      flags: { ordemparanormal2: { adventureImport: flag } },
    }]);
  });
});
