import { SYSTEM_ID } from "../../../config/system-config";
import {
  resolvePoiInvestigationView,
  type PoiInvestigationResult,
} from "./resolve-poi-investigation-view";

export const POI_INVESTIGATION_QUERY = `${SYSTEM_ID}.poiInvestigation`;

export interface PoiInvestigationQueryData {
  readonly sceneId: string;
  readonly regionId: string;
}

// Foundry 14.367 invokes a CONFIG.queries handler as `handler(data, { user, timeout })`,
// where `user` is the server-resolved requesting User. @dfreds/foundry-types omits the
// second argument, so the shape is declared locally.
type PoiInvestigationQueryHandler = (
  data: PoiInvestigationQueryData,
  context: { readonly user: foundry.documents.User; readonly timeout?: number },
) => Promise<PoiInvestigationResult>;

const handler: PoiInvestigationQueryHandler = (data, context) =>
  resolvePoiInvestigationView({
    sceneId: data.sceneId,
    regionId: data.regionId,
    requesterUserId: context.user.id,
  });

/** Registers the GM-side query handler. Called once during `init`. */
export function registerPoiInvestigationQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> })
    .queries[POI_INVESTIGATION_QUERY] = handler;
}

interface ActiveGmUser {
  query(name: string, data: object, options?: { timeout?: number }): Promise<unknown>;
}

/**
 * Obtains the sanitized projection for a POI placement. The GM resolves it
 * locally; a player asks the active GM through the public query API and never
 * resolves the Item itself.
 */
export async function requestPoiInvestigationView(
  data: PoiInvestigationQueryData,
): Promise<PoiInvestigationResult> {
  if (game.user?.isGM) {
    return resolvePoiInvestigationView({ ...data, requesterUserId: game.user.id ?? "" });
  }

  const activeGM = (game as typeof game & { users?: { activeGM?: ActiveGmUser | null } })
    .users?.activeGM;
  if (!activeGM) return { error: "no-gm" };

  try {
    return (await activeGM.query(POI_INVESTIGATION_QUERY, data, { timeout: 10000 })) as PoiInvestigationResult;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | POI investigation query failed`, error);
    return { error: "unavailable" };
  }
}
