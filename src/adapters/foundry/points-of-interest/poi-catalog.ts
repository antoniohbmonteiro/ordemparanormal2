import { POINT_OF_INTEREST_ITEM_TYPE } from "../../../config/system-config";
import {
  resolveSingleItemCatalogSource,
  type SingleItemCatalogEntry,
  type SingleItemCatalogSource,
} from "../items/single-item-catalog";
import { isGmControlledPoi, worldPoi } from "./poi-runtime-state";

export type PoiCatalogEntry = SingleItemCatalogEntry;
export type PoiSelection = { readonly itemUuid: string; readonly name: string; readonly origin: string };

const definition = {
  itemType: POINT_OF_INTEREST_ITEM_TYPE,
  worldLabelKey: "ORDEMPARANORMAL2.PointOfInterest.Picker.World",
  unavailableSourceMessage: "The selected Point of Interest is unavailable.",
};

export async function loadAvailablePois(): Promise<readonly PoiCatalogEntry[]> {
  return (game.items.contents as foundry.documents.Item[]).filter(item => item.type === POINT_OF_INTEREST_ITEM_TYPE && !!item.id && isGmControlledPoi(item))
    .map(item => ({ key: `world:${item.id}`, uuid: item.uuid, name: item.name,
      img: item.img ?? "icons/svg/item-bag.svg", origin: game.i18n.localize(definition.worldLabelKey),
      source: { kind: "world" as const, documentId: item.id! } }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function describeItem(value: unknown): PoiSelection | null {
  if (!(value instanceof foundry.documents.Item) || value.type !== POINT_OF_INTEREST_ITEM_TYPE
    || value.isEmbedded || !value.visible || !value.uuid || !worldPoi(value.uuid) || !isGmControlledPoi(value)) return null;
  return {
    itemUuid: value.uuid,
    name: value.name,
    origin: game.i18n.localize(definition.worldLabelKey),
  };
}

export async function resolvePoiCatalogSource(source: SingleItemCatalogSource): Promise<PoiSelection> {
  if (source.kind !== "world") throw new Error(definition.unavailableSourceMessage);
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
