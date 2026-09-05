import { OCCUPATION_ITEM_TYPE } from "../../../config/system-config";
import {
  loadAvailableSingleItems,
  resolveSingleItemCatalogSource,
  type SingleItemCatalogEntry,
  type SingleItemCatalogSource,
} from "../items/single-item-catalog";

export type OccupationCatalogSource = SingleItemCatalogSource;
export type OccupationCatalogEntry = SingleItemCatalogEntry;

const OCCUPATION_CATALOG = {
  itemType: OCCUPATION_ITEM_TYPE,
  worldLabelKey: "ORDEMPARANORMAL2.OccupationPicker.Origins.World",
  unavailableSourceMessage:
    "The selected Occupation source is no longer available.",
} as const;

export function loadAvailableOccupations(): Promise<
  readonly OccupationCatalogEntry[]
> {
  return loadAvailableSingleItems(OCCUPATION_CATALOG);
}

export function resolveOccupationCatalogSource(
  source: OccupationCatalogSource,
): Promise<foundry.documents.Item> {
  return resolveSingleItemCatalogSource(source, OCCUPATION_CATALOG);
}
