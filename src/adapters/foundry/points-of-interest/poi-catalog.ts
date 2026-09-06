import { POINT_OF_INTEREST_ITEM_TYPE } from "../../../config/system-config";
import {
  loadAvailableSingleItems,
  resolveSingleItemCatalogSource,
  type SingleItemCatalogEntry,
  type SingleItemCatalogSource,
} from "../items/single-item-catalog";

export type PoiCatalogEntry = SingleItemCatalogEntry;
export type PoiSelection = { readonly itemUuid: string; readonly name: string; readonly origin: string };

const definition = {
  itemType: POINT_OF_INTEREST_ITEM_TYPE,
  worldLabelKey: "ORDEMPARANORMAL2.PointOfInterest.Picker.World",
  unavailableSourceMessage: "The selected Point of Interest is unavailable.",
};

export function loadAvailablePois(): Promise<readonly PoiCatalogEntry[]> {
  return loadAvailableSingleItems(definition);
}

function describeItem(value: unknown): PoiSelection | null {
  if (!(value instanceof foundry.documents.Item) || value.type !== POINT_OF_INTEREST_ITEM_TYPE
    || value.isEmbedded || !value.visible || !value.uuid) return null;
  const catalogGame = game as typeof game & {
    readonly packs: { get(id: string): { readonly title: string; readonly visible: boolean } | undefined };
  };
  const pack = value.pack ? catalogGame.packs.get(value.pack) : null;
  if (value.pack && (!pack || !pack.visible)) return null;
  return {
    itemUuid: value.uuid,
    name: value.name,
    origin: pack?.title ?? game.i18n.localize(definition.worldLabelKey),
  };
}

export async function resolvePoiCatalogSource(source: SingleItemCatalogSource): Promise<PoiSelection> {
  const selection = describeItem(await resolveSingleItemCatalogSource(source, definition));
  if (!selection) throw new Error(definition.unavailableSourceMessage);
  return selection;
}

export async function resolvePoiAssociation(itemUuid: string): Promise<PoiSelection | null> {
  try {
    const selection = describeItem(await fromUuid(itemUuid));
    return selection?.itemUuid === itemUuid ? selection : null;
  } catch {
    return null;
  }
}
