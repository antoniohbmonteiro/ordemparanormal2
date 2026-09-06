import { SYSTEM_ID } from "../../../config/system-config";

export const POI_REGION_FLAG = "pointOfInterest";
export const POI_REGION_FLAG_PATH = `flags.${SYSTEM_ID}.${POI_REGION_FLAG}`;

export type PointOfInterestRegionAssociation = {
  readonly itemUuid: string;
  /** Safe display name snapshot, written by the GM's picker. Never a projection of Item content. */
  readonly name?: string;
};
export type PoiAssociationDraft =
  | { readonly kind: "unchanged" }
  | { readonly kind: "associate"; readonly association: PointOfInterestRegionAssociation }
  | { readonly kind: "remove" };

export function parsePoiRegionAssociation(value: unknown): PointOfInterestRegionAssociation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const itemUuid = (value as { itemUuid?: unknown }).itemUuid;
  if (typeof itemUuid !== "string" || itemUuid.trim().length === 0) return null;
  const rawName = (value as { name?: unknown }).name;
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName : undefined;
  return name === undefined ? { itemUuid } : { itemUuid, name };
}

export function readPoiRegionAssociation(
  region: { getFlag(scope: string, key: string): unknown },
): PointOfInterestRegionAssociation | null {
  return parsePoiRegionAssociation(region.getFlag(SYSTEM_ID, POI_REGION_FLAG));
}

export function buildPoiRegionAssociationUpdate(draft: PoiAssociationDraft): Record<string, unknown> {
  if (draft.kind === "unchanged") return {};
  const operators = foundry.data.operators;
  return {
    [POI_REGION_FLAG_PATH]: draft.kind === "remove"
      ? new operators.ForcedDeletion()
      : operators.ForcedReplacement.create(
        draft.association.name === undefined
          ? { itemUuid: draft.association.itemUuid }
          : { itemUuid: draft.association.itemUuid, name: draft.association.name },
      ),
  };
}
