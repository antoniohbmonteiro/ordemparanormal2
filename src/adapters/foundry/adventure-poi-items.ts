import { poiSystem, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";
import { stableSerialize } from "../../core/adventure-import/adventure-agent-reconciliation";
import type { PointOfInterestSystemData } from "../../documents/item/point-of-interest-data";
import { ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH, type AdventureFolderPlacementFlag } from "../../features/adventure-import/adventure-folders";
import { ADVENTURE_POI_FALLBACK_IMAGE, ADVENTURE_POI_FLAG_PATH,
  type PoiImportFlag, type PoiItemPort, type PoiItemSnapshot } from "../../features/adventure-import/import-adventure-pois";

const SCOPE = "ordemparanormal2";

function itemById(id: string): foundry.documents.Item {
  const item = game.items.get(id);
  if (!item) throw new Error(`POI importado não encontrado: ${id}.`);
  return item;
}

function snapshot(item: foundry.documents.Item): PoiItemSnapshot {
  const source = item.toObject();
  return { id: item.id!, type: item.type, folderId: item.folder?.id ?? null, img: item.img,
    flag: item.getFlag(SCOPE, "adventureImport"),
    folderPlacement: item.getFlag(SCOPE, "adventureImportFolder"),
    system: source.system as PointOfInterestSystemData };
}

export function createAdventurePoiItemPort(): PoiItemPort {
  const authorized = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;
  function guard(): void { if (!authorized()) throw new Error("Somente o GM ativo pode importar POIs."); }
  function validate(preset: AdventurePoiPreset, flag: PoiImportFlag): void {
    const candidate = new foundry.documents.Item.implementation({ name: preset.name, type: "pointOfInterest", img: ADVENTURE_POI_FALLBACK_IMAGE,
      system: structuredClone(poiSystem(preset)), flags: { [SCOPE]: { adventureImport: flag } } }, { strict: true });
    if (!candidate.validate({ strict: true }) || stableSerialize(snapshot(candidate).system) !== stableSerialize(poiSystem(preset))) {
      throw new Error(`O modelo v14 alterou os dados do POI ${preset.id}.`);
    }
  }
  return {
    isAuthorized: authorized,
    listItems: () => game.items.contents.map(snapshot),
    validateCandidate: validate,
    async createItem(preset, img, folderId, flag, placement: AdventureFolderPlacementFlag) {
      guard();
      const item = await foundry.documents.Item.implementation.create({ name: preset.name, type: "pointOfInterest",
        img: img as foundry.documents.Item["img"],
        folder: folderId, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        system: structuredClone(poiSystem(preset)),
        flags: { [SCOPE]: { adventureImport: flag, adventureImportFolder: placement } } });
      if (!item?.id || item.folder?.id !== folderId || item.img !== img
        || stableSerialize(item.getFlag(SCOPE, "adventureImport")) !== stableSerialize(flag)
        || stableSerialize(item.getFlag(SCOPE, "adventureImportFolder")) !== stableSerialize(placement)) {
        throw new Error(`Criação do POI não confirmada: ${preset.id}.`);
      }
      return item.id;
    },
    async updateFolderPlacement(id, folderId, flag) {
      guard();
      const item = itemById(id);
      await item.update({ folder: folderId, [ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH]: flag });
      if ((item.folder?.id ?? null) !== folderId || stableSerialize(item.getFlag(SCOPE, "adventureImportFolder")) !== stableSerialize(flag)) {
        throw new Error(`Organização do POI não confirmada: ${id}.`);
      }
    },
    async updateImageIfFallback(id, img) {
      guard();
      const item = itemById(id);
      if (item.img !== ADVENTURE_POI_FALLBACK_IMAGE) return false;
      await item.update({ img });
      if (item.img !== img) throw new Error(`Imagem do POI não confirmada: ${id}.`);
      return true;
    },
    async updateItem(id, system: PointOfInterestSystemData, flag) {
      guard();
      const item = itemById(id);
      await item.update({ "system.publicDescription": system.publicDescription,
        "system.gmContext": system.gmContext, "system.skills": structuredClone(system.skills),
        [ADVENTURE_POI_FLAG_PATH]: foundry.data.operators.ForcedReplacement.create(structuredClone(flag)) });
      if (stableSerialize(snapshot(item).system) !== stableSerialize(system)
        || stableSerialize(item.getFlag(SCOPE, "adventureImport")) !== stableSerialize(flag)) {
        throw new Error(`Atualização do POI não confirmada: ${id}.`);
      }
    },
    async completeItem(id, flag) {
      guard();
      const item = itemById(id);
      await item.update({ [ADVENTURE_POI_FLAG_PATH]: foundry.data.operators.ForcedReplacement.create(structuredClone(flag)) });
      if (stableSerialize(item.getFlag(SCOPE, "adventureImport")) !== stableSerialize(flag)) throw new Error(`Baseline do POI não confirmado: ${id}.`);
    },
  };
}
