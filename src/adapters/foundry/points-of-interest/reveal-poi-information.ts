import { POINT_OF_INTEREST_ITEM_TYPE } from "../../../config/system-config";
import { readPointOfInterestSkills } from "../../../documents/item/point-of-interest-data";
import {
  buildPoiInformationRevealUpdate,
  readPoiInformationRevealState,
} from "./poi-information-reveal-state";
import { readPoiRegionAssociation } from "./poi-region-association";

export interface RevealPoiInformationInput {
  readonly sceneId: string;
  readonly regionId: string;
  readonly expectedItemUuid: string;
  readonly informationId: string;
}

export type RevealPoiInformationResult =
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly reason: "forbidden" | "stale" | "unavailable" };

interface RevealRegion {
  getFlag(scope: string, key: string): unknown;
  update(data: Record<string, unknown>): Promise<unknown>;
}

function resolveRegion(sceneId: string, regionId: string): RevealRegion | null {
  const scene = (game as typeof game & {
    scenes?: { get(id: string): { regions?: { get(id: string): unknown } } | undefined };
  }).scenes?.get(sceneId);
  return (scene?.regions?.get(regionId) as RevealRegion | undefined) ?? null;
}

/** GM-local, server-permission-backed mutation for one placement information. */
export async function revealPoiInformation(
  input: RevealPoiInformationInput,
): Promise<RevealPoiInformationResult> {
  if (!game.user?.isGM) return { ok: false, reason: "forbidden" };

  const region = resolveRegion(input.sceneId, input.regionId);
  if (!region) return { ok: false, reason: "unavailable" };
  const association = readPoiRegionAssociation(region);
  if (!association) return { ok: false, reason: "unavailable" };
  if (association.itemUuid !== input.expectedItemUuid) {
    return { ok: false, reason: "stale" };
  }

  const item = (await fromUuid(input.expectedItemUuid)) as
    | { readonly uuid?: string; readonly type?: string; readonly system?: unknown }
    | null;
  if (
    !item
    || item.uuid !== input.expectedItemUuid
    || item.type !== POINT_OF_INTEREST_ITEM_TYPE
  ) {
    return { ok: false, reason: "unavailable" };
  }

  const skills = readPointOfInterestSkills(item.system);
  const validIds = new Set(
    skills.flatMap(group => group.information.map(entry => entry.id)),
  );
  if (!validIds.has(input.informationId)) {
    return { ok: false, reason: "stale" };
  }

  const current = readPoiInformationRevealState(region, input.expectedItemUuid);
  const currentValidIds = current.informationIds.filter(id => validIds.has(id));
  const alreadyRevealed = currentValidIds.includes(input.informationId);
  if (
    alreadyRevealed
    && currentValidIds.length === current.informationIds.length
  ) {
    return { ok: true, changed: false };
  }

  const latestRegion = resolveRegion(input.sceneId, input.regionId);
  if (!latestRegion) return { ok: false, reason: "unavailable" };
  if (readPoiRegionAssociation(latestRegion)?.itemUuid !== input.expectedItemUuid) {
    return { ok: false, reason: "stale" };
  }

  await latestRegion.update(buildPoiInformationRevealUpdate({
    itemUuid: input.expectedItemUuid,
    informationIds: alreadyRevealed
      ? currentValidIds
      : [...currentValidIds, input.informationId],
  }));
  return { ok: true, changed: true };
}
