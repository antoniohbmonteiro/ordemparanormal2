import { SYSTEM_ID } from "../../../config/system-config";

export const POI_INFORMATION_REVEAL_FLAG = "pointOfInterestInformationReveal";
export const POI_INFORMATION_REVEAL_FLAG_PATH =
  `flags.${SYSTEM_ID}.${POI_INFORMATION_REVEAL_FLAG}`;

export interface PoiInformationRevealState {
  readonly itemUuid: string;
  readonly informationIds: readonly string[];
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parsePoiInformationRevealState(
  value: unknown,
): PoiInformationRevealState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as { itemUuid?: unknown; informationIds?: unknown };
  if (!isNonBlankString(source.itemUuid) || !Array.isArray(source.informationIds)) {
    return null;
  }
  const informationIds = [
    ...new Set(source.informationIds.filter(isNonBlankString)),
  ];
  return { itemUuid: source.itemUuid, informationIds };
}

export function readPoiInformationRevealState(
  region: { getFlag(scope: string, key: string): unknown },
  expectedItemUuid: string,
): PoiInformationRevealState {
  const parsed = parsePoiInformationRevealState(
    region.getFlag(SYSTEM_ID, POI_INFORMATION_REVEAL_FLAG),
  );
  return parsed?.itemUuid === expectedItemUuid
    ? parsed
    : { itemUuid: expectedItemUuid, informationIds: [] };
}

export function buildPoiInformationRevealUpdate(
  state: PoiInformationRevealState,
): Record<string, unknown> {
  return {
    [POI_INFORMATION_REVEAL_FLAG_PATH]:
      foundry.data.operators.ForcedReplacement.create({
        itemUuid: state.itemUuid,
        informationIds: [...state.informationIds],
      }),
  };
}
