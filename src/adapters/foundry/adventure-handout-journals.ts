import type { AdventureHandoutReference } from "../../core/adventure-import/adventure-definition";
import type { HandoutImportFlag, HandoutImportMetadata, HandoutJournalPort, HandoutJournalSnapshot } from "../../features/adventure-import/import-adventure-handouts";
import { ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH, type AdventureFolderPlacementFlag } from "../../features/adventure-import/adventure-folders";

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
        folderId: journal.folder?.id ?? null,
        folderPlacement: journal.getFlag(FLAG_SCOPE, "adventureImportFolder"),
        pages: journal.pages.contents.map((page) => ({
          id: page.id!,
          flag: page.getFlag(FLAG_SCOPE, FLAG_KEY),
          type: page.type,
          src: page.src ?? null,
        })),
      }));
    },
    async createJournal(
      handout: AdventureHandoutReference, storedPath: string, folderId: string, flag: HandoutImportFlag,
      folderPlacement: AdventureFolderPlacementFlag,
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
        flags: { [FLAG_SCOPE]: { [FLAG_KEY]: flag, adventureImportFolder: folderPlacement } },
      });
      if (!created?.id || created.folder?.id !== folderId
        || JSON.stringify(created.getFlag(FLAG_SCOPE, "adventureImportFolder")) !== JSON.stringify(folderPlacement)) {
        throw new Error(`Journal creation was not confirmed: ${handout.id}`);
      }
      return created.id;
    },
    async updateFolderPlacement(journalId, folderId, flag) {
      const journal = journalById(journalId);
      await journal.update({ folder: folderId, [ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH]: flag });
      if ((journal.folder?.id ?? null) !== folderId
        || JSON.stringify(journal.getFlag(FLAG_SCOPE, "adventureImportFolder")) !== JSON.stringify(flag)) {
        throw new Error("Organização do Journal não confirmada.");
      }
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
