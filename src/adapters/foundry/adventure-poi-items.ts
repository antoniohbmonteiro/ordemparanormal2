import { poiSystem, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";
import { managedDigest, stableSerialize } from "../../core/adventure-import/adventure-agent-reconciliation";
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

interface Difference { readonly path: string; readonly actual: unknown; readonly expected: unknown }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function differences(actual: unknown, expected: unknown, path: string): Difference[] {
  if (stableSerialize(actual) === stableSerialize(expected)) return [];
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return Array.from({ length: Math.max(actual.length, expected.length) }, (_, index) =>
      differences(actual[index], expected[index], `${path}[${index}]`)).flat();
  }
  const left = record(actual), right = record(expected);
  if (left && right) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].sort().flatMap(key => differences(left[key], right[key],
      key in right ? `${path}.${key}` : `${path}.[unexpected key]`));
  }
  return [{ path, actual, expected }];
}

function poiDifferences(actual: PoiItemSnapshot, system: PointOfInterestSystemData, flag: PoiImportFlag): Difference[] {
  return [
    ...differences(actual.system, system, "system"),
    ...differences(actual.flag, flag, ADVENTURE_POI_FLAG_PATH),
  ];
}

function fieldStatus(actual: PoiItemSnapshot, system: PointOfInterestSystemData, flag: PoiImportFlag): string {
  const fields = [
    ["publicDescription", actual.system.publicDescription, system.publicDescription],
    ["gmContext", actual.system.gmContext, system.gmContext],
    ["information", actual.system.information, system.information],
    ["adventureImport", actual.flag, flag],
  ] as const;
  return fields.map(([name, value, expected]) => `${name}=${stableSerialize(value) === stableSerialize(expected) ? "igual" : "diferente"}`).join(", ");
}

async function stringMetadata(difference: Difference): Promise<string | null> {
  if (typeof difference.actual !== "string" || typeof difference.expected !== "string") return null;
  const { actual, expected } = difference;
  let index = 0;
  while (index < Math.min(actual.length, expected.length) && actual[index] === expected[index]) index++;
  const codePoint = (value: string) => value.codePointAt(index)?.toString(16).toUpperCase().padStart(4, "0") ?? "EOF";
  const entity = ([
    ["&quot;", '"'], ["&#39;", "'"], ["&amp;", "&"], ["&lt;", "<"], ["&gt;", ">"],
  ] as const).find(([encoded, decoded]) => expected.startsWith(encoded, index) && actual.startsWith(decoded, index));
  return `${difference.path}: expectedLength=${expected.length}, persistedLength=${actual.length}, firstDifference=${index}, `
    + `expectedCodePoint=${codePoint(expected)}, persistedCodePoint=${codePoint(actual)}, `
    + `expectedDigest=${await managedDigest(expected)}, persistedDigest=${await managedDigest(actual)}`
    + (entity ? `, entityNormalization=${entity[0]}→U+${codePoint(actual)}` : "");
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
      const before = snapshot(item);
      const update: Record<string, unknown> = {
        system: foundry.data.operators.ForcedReplacement.create(structuredClone(system)),
        [ADVENTURE_POI_FLAG_PATH]: foundry.data.operators.ForcedReplacement.create(structuredClone(flag)),
      };
      await item.update(update);
      const after = snapshot(item);
      const changed = poiDifferences(after, system, flag);
      if (changed.length) {
        const metadata = (await Promise.all(changed.map(stringMetadata))).filter((value): value is string => value !== null);
        throw new Error(`Atualização do POI não confirmada: ${id} (${flag.documentId}). `
          + `Campos divergentes: ${changed.map(value => value.path).join(", ")}. `
          + `Antes: ${fieldStatus(before, system, flag)}. Depois: ${fieldStatus(after, system, flag)}.`
          + (metadata.length ? ` Metadados: ${metadata.join("; ")}.` : ""));
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
