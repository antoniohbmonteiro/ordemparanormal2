import {
  ADVENTURE_FOLDER_FLAG_PATH, type AdventureFolderFlag, type AdventureFolderPort,
} from "../../features/adventure-import/adventure-folders";

const SCOPE = "ordemparanormal2";
const KEY = "adventureImport";

export function createAdventureFolderPort(): AdventureFolderPort {
  const authorized = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;
  function guard(): void {
    if (!authorized()) throw new Error("Somente o GM ativo pode organizar as pastas da aventura.");
  }
  function snapshot(folder: foundry.documents.Folder) {
    const source = folder.toObject();
    return { id: folder.id!, name: source.name, color: source.color ?? null, type: source.type,
      parentId: source.folder ?? null, flag: folder.getFlag(SCOPE, KEY) };
  }
  return {
    isAuthorized: authorized,
    listFolders: () => game.folders.contents.map(snapshot),
    async createFolder(data) {
      guard();
      const created = await foundry.documents.Folder.create({ name: data.name, color: data.color,
        type: data.documentType, folder: data.parentId, flags: { [SCOPE]: { [KEY]: data.flag } } });
      if (!created?.id) throw new Error(`Criação de Folder não confirmada: ${data.flag.folderId}.`);
      return created.id;
    },
    async updateFolder(id, data) {
      guard();
      const folder = game.folders.get(id);
      if (!folder) throw new Error(`Folder gerenciada não encontrada: ${id}.`);
      await folder.update({ name: data.name, color: data.color, [ADVENTURE_FOLDER_FLAG_PATH]: data.flag });
      const persisted = snapshot(folder);
      const flag = persisted.flag as AdventureFolderFlag;
      if (persisted.name !== data.name || persisted.color?.toLowerCase() !== data.color
        || flag?.importer !== "folder" || flag.documentType !== data.flag.documentType || flag.folderId !== data.flag.folderId) {
        throw new Error(`Atualização de Folder não confirmada: ${id}.`);
      }
    },
  };
}
