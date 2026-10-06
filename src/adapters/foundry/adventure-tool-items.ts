import { stableSerialize } from "../../core/adventure-import/adventure-agent-reconciliation";
import { ADVENTURE_TOOL_FALLBACK_IMAGE, type AdventureToolItemPort, type ToolItemSnapshot } from "../../features/adventure-import/import-adventure-tools";
import { equipmentSourceUuid } from "./equipment/equipment-source";

const SCOPE = "ordemparanormal2";
interface EquipmentPack {
  readonly documentName: string;
  getIndex(options: { fields: string[] }): Promise<Iterable<{ _id: string; uuid: string; type: string }>>;
  getDocument(id: string): Promise<foundry.documents.Item<null> | undefined>;
}
function snapshot(item: foundry.documents.Item): ToolItemSnapshot {
  return { id: item.id!, type: item.type, img: item.img, sourceUuid: equipmentSourceUuid(item),
    flag: item.getFlag(SCOPE, "adventureImport") };
}

export function createAdventureToolItemPort(): AdventureToolItemPort {
  const catalogGame = game as typeof game & { packs: { get(id: string): EquipmentPack | undefined } };
  const items = game.items as foundry.documents.collections.Items<foundry.documents.Item<null>>;
  const prepared = new Map<string, foundry.documents.Item["_source"]>();
  const authorized = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;
  function guard() { if (!authorized()) throw new Error("Somente o GM ativo pode importar ferramentas."); }
  function itemById(id: string) {
    const item = game.items.get(id);
    if (!item || item.type !== "equipment") throw new Error("Ferramenta importada não encontrada.");
    return item;
  }
  return {
    isAuthorized: authorized,
    listItems: () => game.items.contents.map(snapshot),
    async prepareCanonical(sourceUuid, sourceId, img) {
      guard();
      const pack = catalogGame.packs.get("ordemparanormal2.equipment");
      if (!pack || pack.documentName !== "Item") throw new Error("Compendium de equipamentos indisponível.");
      const index = await pack.getIndex({ fields: ["type"] });
      const matches = [...index].filter(entry => entry._id === sourceId && entry.uuid === sourceUuid && entry.type === "equipment");
      if (matches.length !== 1) throw new Error(`Fonte canônica de ferramenta inválida: ${sourceUuid}.`);
      const source = await pack.getDocument(matches[0]._id);
      if (!source || source.documentName !== "Item" || source.type !== "equipment" || source.uuid !== sourceUuid
        || source.id !== sourceId || source.isEmbedded) throw new Error(`Equipment canônico inválido: ${sourceUuid}.`);
      const data = items.fromCompendium(source, { keepId: false, clearFolder: true, clearOwnership: true });
      const candidate = new foundry.documents.Item.implementation({ ...data, img: img as foundry.documents.Item["img"] }, { strict: true });
      if (!candidate.validate({ strict: true }) || equipmentSourceUuid(candidate) !== sourceUuid)
        throw new Error(`Origem canônica da ferramenta não preservada: ${sourceUuid}.`);
      prepared.set(sourceUuid, data);
    },
    async createItem(flag, img, folderId, placement) {
      guard();
      const data = prepared.get(flag.sourceUuid);
      if (!data) throw new Error("Equipment canônico não preparado.");
      const flags = foundry.utils.mergeObject(structuredClone(data.flags ?? {}), { [SCOPE]: {
        adventureImport: flag, adventureImportFolder: placement,
      } }, { inplace: false });
      const item = await foundry.documents.Item.implementation.create({ ...structuredClone(data),
        img: img as foundry.documents.Item["img"], folder: folderId, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags });
      if (!item?.id || item.folder?.id !== folderId || item.img !== img || equipmentSourceUuid(item) !== flag.sourceUuid
        || stableSerialize(item.getFlag(SCOPE, "adventureImport")) !== stableSerialize(flag)
        || stableSerialize(item.getFlag(SCOPE, "adventureImportFolder")) !== stableSerialize(placement))
        throw new Error("Criação da ferramenta não confirmada.");
      return item.id;
    },
    async updateImageIfFallback(id, img) {
      guard(); const item = itemById(id);
      if (item.img !== ADVENTURE_TOOL_FALLBACK_IMAGE) return false;
      await item.update({ img });
      if (item.img !== img) throw new Error("Imagem da ferramenta não confirmada.");
      return true;
    },
    async completeItem(id, flag) {
      guard(); const item = itemById(id);
      await item.update({ "flags.ordemparanormal2.adventureImport": flag });
      if (stableSerialize(item.getFlag(SCOPE, "adventureImport")) !== stableSerialize(flag)) throw new Error("Provenance da ferramenta não confirmada.");
    },
  };
}
