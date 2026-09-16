import type { AdventureHandoutReference } from "../../core/adventure-import/adventure-definition";
import type {
  HandoutFolderFlag, HandoutImportFlag, HandoutImportMetadata, HandoutJournalPort,
  HandoutJournalSnapshot, HandoutFolderSnapshot,
} from "../../features/adventure-import/import-adventure-handouts";

const FLAG_SCOPE = "ordemparanormal2";
const FLAG_KEY = "adventureImport";
const FLAG_PATH = `flags.${FLAG_SCOPE}.${FLAG_KEY}`;

function journalById(id: string): foundry.documents.JournalEntry {
  const journal = game.journal.get(id);
  if (!journal) throw new Error(`Imported Journal is missing: ${id}`);
  return journal;
}

function metadataUpdate(metadata: HandoutImportMetadata): Record<string, string | number> {
  return {
    [`${FLAG_PATH}.version`]: metadata.version,
    [`${FLAG_PATH}.act`]: metadata.act,
    [`${FLAG_PATH}.assetId`]: metadata.assetId,
  };
}

export function createAdventureHandoutJournalPort(): HandoutJournalPort {
  return {
    isAuthorized: () => game.user.isGM && game.users.activeGM?.id === game.user.id,
    listJournals(): readonly HandoutJournalSnapshot[] {
      return game.journal.contents.map((journal) => ({
        id: journal.id!,
        flag: journal.getFlag(FLAG_SCOPE, FLAG_KEY),
        pages: journal.pages.contents.map((page) => ({
          id: page.id!,
          flag: page.getFlag(FLAG_SCOPE, FLAG_KEY),
          type: page.type,
          src: page.src ?? null,
        })),
      }));
    },
    listFolders(): readonly HandoutFolderSnapshot[] {
      return game.folders.contents.map((folder) => ({
        id: folder.id!,
        type: folder.type,
        flag: folder.getFlag(FLAG_SCOPE, FLAG_KEY),
      }));
    },
    async createFolder(name: string, parentId: string | null, flag: HandoutFolderFlag): Promise<string> {
      const created = await foundry.documents.Folder.create({
        name, type: "JournalEntry", folder: parentId,
        flags: { [FLAG_SCOPE]: { [FLAG_KEY]: flag } },
      });
      if (!created?.id) throw new Error(`Folder creation was not confirmed: ${flag.folderId}`);
      return created.id;
    },
    async createJournal(
      handout: AdventureHandoutReference, storedPath: string, folderId: string, flag: HandoutImportFlag,
    ): Promise<string> {
      const created = await foundry.documents.JournalEntry.create({
        name: handout.label,
        folder: folderId,
        pages: [{
          name: handout.label,
          type: handout.pageType,
          src: storedPath,
          flags: { [FLAG_SCOPE]: { [FLAG_KEY]: flag } },
        }],
        flags: { [FLAG_SCOPE]: { [FLAG_KEY]: flag } },
      });
      if (!created?.id) throw new Error(`Journal creation was not confirmed: ${handout.id}`);
      return created.id;
    },
    async updateJournalMetadata(journalId: string, metadata: HandoutImportMetadata): Promise<void> {
      await journalById(journalId).update(metadataUpdate(metadata));
    },
    async createPage(
      journalId: string, name: string, type: "image" | "pdf", src: string, flag: HandoutImportFlag,
    ): Promise<void> {
      const pages = await journalById(journalId).createEmbeddedDocuments("JournalEntryPage", [{
        name, type, src, flags: { [FLAG_SCOPE]: { [FLAG_KEY]: flag } },
      }]);
      if (pages.length !== 1) throw new Error(`Page creation was not confirmed: ${flag.documentId}`);
    },
    async updatePage(
      journalId: string, pageId: string, type: "image" | "pdf", src: string, metadata: HandoutImportMetadata,
    ): Promise<void> {
      await journalById(journalId).updateEmbeddedDocuments("JournalEntryPage", [{
        _id: pageId, type, src, ...metadataUpdate(metadata),
      }]);
    },
  };
}
