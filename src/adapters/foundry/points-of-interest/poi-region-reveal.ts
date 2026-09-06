import { SYSTEM_ID } from "../../../config/system-config";

export const POI_REGION_REVEAL_FLAG = "pointOfInterestReveal";
export const POI_REGION_REVEAL_FLAG_PATH = `flags.${SYSTEM_ID}.${POI_REGION_REVEAL_FLAG}`;

export type PoiRevealMode = "hidden" | "everyone" | "users";

export interface PoiRegionReveal {
  readonly mode: PoiRevealMode;
  readonly users: readonly string[];
  readonly notified: readonly string[];
}

function readStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) seen.add(entry);
  }
  return [...seen];
}

/**
 * Defensive reader for the reveal flag. A missing or structurally invalid value
 * is treated as fully hidden; an unknown `mode` collapses to `"hidden"`.
 */
export function parsePoiRegionReveal(value: unknown): PoiRegionReveal {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { mode: "hidden", users: [], notified: [] };
  }
  const source = value as { mode?: unknown; users?: unknown; notified?: unknown };
  const mode: PoiRevealMode =
    source.mode === "everyone" || source.mode === "users" ? source.mode : "hidden";
  return {
    mode,
    users: mode === "users" ? readStringList(source.users) : [],
    notified: readStringList(source.notified),
  };
}

export function readPoiRegionReveal(
  region: { getFlag(scope: string, key: string): unknown },
): PoiRegionReveal {
  return parsePoiRegionReveal(region.getFlag(SYSTEM_ID, POI_REGION_REVEAL_FLAG));
}

/**
 * Authorization predicate. The GM always has access to the POI regardless of the
 * reveal state.
 */
export function isPoiRevealedTo(
  reveal: PoiRegionReveal,
  userId: string,
  isGM: boolean,
): boolean {
  if (isGM) return true;
  if (reveal.mode === "everyone") return true;
  if (reveal.mode === "users") return reveal.users.includes(userId);
  return false;
}

/**
 * User ids that are authorized after a reveal change and have never been
 * notified before. `notified` alone defines "first time"; no before/after diff
 * is needed.
 */
export function selectNewlyRevealedUserIds(
  reveal: PoiRegionReveal,
  authorizedNow: readonly string[],
): readonly string[] {
  const alreadyNotified = new Set(reveal.notified);
  const newly: string[] = [];
  for (const userId of authorizedNow) {
    if (!alreadyNotified.has(userId) && !newly.includes(userId)) newly.push(userId);
  }
  return newly;
}

export function buildPoiRegionRevealUpdate(reveal: PoiRegionReveal): Record<string, unknown> {
  return {
    [POI_REGION_REVEAL_FLAG_PATH]: foundry.data.operators.ForcedReplacement.create({
      mode: reveal.mode,
      users: [...reveal.users],
      notified: [...reveal.notified],
    }),
  };
}
