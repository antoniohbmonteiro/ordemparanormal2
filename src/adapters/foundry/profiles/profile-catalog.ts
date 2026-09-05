import { PROFILE_ITEM_TYPE } from "../../../config/system-config";
import {
  loadAvailableSingleItems,
  resolveSingleItemCatalogSource,
  type SingleItemCatalogEntry,
  type SingleItemCatalogSource,
} from "../items/single-item-catalog";

export type ProfileCatalogSource = SingleItemCatalogSource;
export type ProfileCatalogEntry = SingleItemCatalogEntry;

const PROFILE_CATALOG = {
  itemType: PROFILE_ITEM_TYPE,
  worldLabelKey: "ORDEMPARANORMAL2.ProfilePicker.Origins.World",
  unavailableSourceMessage:
    "The selected Profile source is no longer available.",
} as const;

export function loadAvailableProfiles(): Promise<
  readonly ProfileCatalogEntry[]
> {
  return loadAvailableSingleItems(PROFILE_CATALOG);
}

export function resolveProfileCatalogSource(
  source: ProfileCatalogSource,
): Promise<foundry.documents.Item> {
  return resolveSingleItemCatalogSource(source, PROFILE_CATALOG);
}
