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

const journalCreate = vi.fn();
const journalUpdate = vi.fn();
const createEmbeddedDocuments = vi.fn();
const updateEmbeddedDocuments = vi.fn();
const page = {
  id: "page-id", type: "pdf", src: "worlds/test/b.pdf",
  getFlag: vi.fn((_scope: string, key: string) => key === "adventureImport" ? flag : undefined),
};
const journal = {
  id: "journal-id", pages: { contents: [page] },
  getFlag: vi.fn((_scope: string, key: string) => key === "adventureImport" ? flag : undefined),
  update: journalUpdate,
  createEmbeddedDocuments,
  updateEmbeddedDocuments,
};

beforeEach(() => {
  journalCreate.mockReset().mockImplementation(async (data: Record<string, unknown>) => ({
    id: "new-journal", folder: { id: data.folder },
    getFlag: (_scope: string, key: string) => key === "adventureImportFolder"
      ? ((data.flags as { ordemparanormal2: { adventureImportFolder: unknown } }).ordemparanormal2.adventureImportFolder) : undefined,
  }));
  journalUpdate.mockReset().mockResolvedValue(journal);
  createEmbeddedDocuments.mockReset().mockResolvedValue([{ id: "new-page" }]);
  updateEmbeddedDocuments.mockReset().mockResolvedValue([page]);
  vi.stubGlobal("foundry", { documents: {
    JournalEntry: { create: journalCreate },
  } });
  vi.stubGlobal("game", {
    user: { isGM: true, id: "active-gm" }, users: { activeGM: { id: "active-gm" } },
    journal: { contents: [journal], get: vi.fn(() => journal) },
    folders: { contents: [] },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Foundry handout Journal adapter", () => {
  it("reads canonical flags from world Journals, pages and Folders", () => {
    const port = createAdventureHandoutJournalPort();
    expect(port.isAuthorized()).toBe(true);
    expect(port.listJournals()).toEqual([{
      id: "journal-id", flag, folderId: null, folderPlacement: undefined,
      pages: [{ id: "page-id", flag, type: "pdf", src: "worlds/test/b.pdf" }],
    }]);
    expect(journal.getFlag).toHaveBeenCalledWith("ordemparanormal2", "adventureImport");
    expect(page.getFlag).toHaveBeenCalledWith("ordemparanormal2", "adventureImport");
  });

  it("creates a PDF Journal with its managed page and folder placement in one operation", async () => {
    const port = createAdventureHandoutJournalPort();
    const placement = { version: 1 as const, adventureId: "playtest-alpha", documentType: "JournalEntry" as const,
      documentId: flag.documentId, act: "actTwo" as const };
    expect(await port.createJournal(handout, "worlds/test/b.pdf", "new-folder", flag, placement)).toBe("new-journal");
    expect(journalCreate).toHaveBeenCalledWith({
      name: handout.label, folder: "new-folder",
      pages: [{ name: handout.label, type: "pdf", src: "worlds/test/b.pdf",
        flags: { ordemparanormal2: { adventureImport: flag } } }],
      flags: { ordemparanormal2: { adventureImport: flag, adventureImportFolder: placement } },
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
