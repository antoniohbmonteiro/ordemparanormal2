import { POINT_OF_INTEREST_ITEM_TYPE } from "../../../config/system-config";
import { skillLabel } from "../../../config/skills";
import {
  readPointOfInterestSkills,
  type PoiInvestigationViewData,
} from "../../../documents/item/point-of-interest-data";
import { readPoiRegionAssociation } from "./poi-region-association";
import { isPoiRevealedTo, readPoiRegionReveal } from "./poi-region-reveal";

export interface PoiInvestigationRequest {
  readonly sceneId: string;
  readonly regionId: string;
  /** Server-authoritative id of the requesting User (query context) or the local GM. */
  readonly requesterUserId: string;
}

export type PoiInvestigationError = "unavailable" | "forbidden" | "no-gm";

export type PoiInvestigationResult =
  | { readonly view: PoiInvestigationViewData }
  | { readonly error: PoiInvestigationError };

interface FlagReader {
  getFlag(scope: string, key: string): unknown;
}

type PoiItem = foundry.documents.Item & {
  readonly type?: string;
  readonly name?: string | null;
  readonly system?: unknown;
};

const UNAVAILABLE: PoiInvestigationResult = { error: "unavailable" };

function scene(sceneId: string): { regions?: { get(id: string): unknown } } | undefined {
  return (game as typeof game & {
    scenes?: { get(id: string): { regions?: { get(id: string): unknown } } | undefined };
  }).scenes?.get(sceneId);
}

function requesterIsGM(userId: string): boolean {
  return (game as typeof game & {
    users?: { get(id: string): { isGM?: boolean } | undefined };
  }).users?.get(userId)?.isGM === true;
}

async function enrichPlayerDescription(raw: string, relativeTo: foundry.documents.Item): Promise<string> {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(raw, {
    relativeTo,
    secrets: false,
  });
}

async function enrichGmContext(raw: string, relativeTo: foundry.documents.Item): Promise<string> {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(raw, {
    relativeTo,
    secrets: true,
  });
}

/**
 * Builds the sanitized player-facing projection for one POI placement.
 *
 * Runs only where the Item can be read (the GM). Non-GM requesters are
 * re-authorized against the placement's reveal state **before** the Item is
 * resolved. Public presentation fields are whitelisted by construction.
 */
export async function resolvePoiInvestigationView(
  request: PoiInvestigationRequest,
): Promise<PoiInvestigationResult> {
  const region = scene(request.sceneId)?.regions?.get(request.regionId) as
    | (FlagReader & Record<string, unknown>)
    | undefined;
  if (!region || typeof region.getFlag !== "function") return UNAVAILABLE;

  const association = readPoiRegionAssociation(region);
  if (!association) return UNAVAILABLE;

  const isGm = requesterIsGM(request.requesterUserId);
  if (
    !isGm
    && !isPoiRevealedTo(readPoiRegionReveal(region), request.requesterUserId, false)
  ) {
    return { error: "forbidden" };
  }

  const item = (await fromUuid(association.itemUuid)) as PoiItem | null;
  if (!item || item.type !== POINT_OF_INTEREST_ITEM_TYPE) return UNAVAILABLE;
  const relativeTo: foundry.documents.Item = item;

  const system = (item.system ?? {}) as {
    readonly publicDescription?: unknown;
    readonly gmContext?: unknown;
  };
  const rawDescription =
    typeof system.publicDescription === "string" ? system.publicDescription : "";
  const rawGmContext = typeof system.gmContext === "string" ? system.gmContext : "";

  const skills = readPointOfInterestSkills(item.system);
  const [description, gmContext] = await Promise.all([
    enrichPlayerDescription(rawDescription, relativeTo),
    isGm ? enrichGmContext(rawGmContext, relativeTo) : Promise.resolve(""),
  ]);
  const base = {
    name:
      item.name
      ?? association.name
      ?? game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.Canvas.Unnamed"),
    description,
    img: typeof item.img === "string" ? item.img : "",
  };
  const view: PoiInvestigationViewData = isGm
    ? {
        ...base,
        audience: "gm",
        gmContext,
        skills: skills.map(({ skill, information }) => ({
          key: skill,
          name: skillLabel(skill),
          information: information.map(({ difficulty, content, showDifficultyToPlayers }) => ({
            difficulty,
            content,
            showDifficultyToPlayers,
          })),
        })),
      }
    : {
        ...base,
        audience: "player",
        skills: skills.map(({ skill, information }) => ({
          key: skill,
          name: skillLabel(skill),
          information: information.map((entry) =>
            entry.showDifficultyToPlayers
              ? { visibility: "public", difficulty: entry.difficulty }
              : { visibility: "hidden" },
          ),
        })),
      };
  const current = scene(request.sceneId)?.regions?.get(request.regionId) as FlagReader | undefined;
  if (!current || readPoiRegionAssociation(current)?.itemUuid !== association.itemUuid) return UNAVAILABLE;
  if (!isGm
    && !isPoiRevealedTo(readPoiRegionReveal(current), request.requesterUserId, false)) return { error: "forbidden" };
  return { view };
}
