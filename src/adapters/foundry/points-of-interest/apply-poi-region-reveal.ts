import { SYSTEM_ID } from "../../../config/system-config";
import {
  buildPoiRegionRevealUpdate,
  readPoiRegionReveal,
  selectNewlyRevealedUserIds,
  type PoiRegionReveal,
  type PoiRevealMode,
} from "./poi-region-reveal";

export interface ApplyPoiRegionRevealInput {
  readonly mode: PoiRevealMode;
  readonly users: readonly string[];
}

export interface ApplyPoiRegionRevealDeps {
  listPlayerUserIds(): readonly string[];
  publishNotice(userIds: readonly string[]): Promise<void>;
}

interface RevealableRegion {
  update(data: Record<string, unknown>): Promise<unknown>;
  getFlag(scope: string, key: string): unknown;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(id => set.has(id));
}

function sameReveal(a: PoiRegionReveal, b: PoiRegionReveal): boolean {
  return a.mode === b.mode && sameIds(a.users, b.users) && sameIds(a.notified, b.notified);
}

/**
 * Applies a POI visibility change to a Region.
 *
 * Persistence is the authoritative operation and the only failure the caller
 * sees: if `region.update` rejects, nothing was written and no whisper is sent.
 * The whisper is a best-effort, at-most-once side effect — `notified` is written
 * together with the reveal, so a chat failure never triggers a retry, and it is
 * swallowed here (logged) rather than surfaced as a reveal failure.
 */
export async function applyPoiRegionReveal(
  region: RevealableRegion,
  input: ApplyPoiRegionRevealInput,
  deps: ApplyPoiRegionRevealDeps,
): Promise<void> {
  const current = readPoiRegionReveal(region);
  const players = new Set(deps.listPlayerUserIds());
  const nextUsers =
    input.mode === "users" ? [...new Set(input.users)].filter(id => players.has(id)) : [];
  const authorizedNow =
    input.mode === "everyone" ? [...players] : input.mode === "users" ? nextUsers : [];
  const newlyRevealed = selectNewlyRevealedUserIds(current, authorizedNow);
  const nextReveal: PoiRegionReveal = {
    mode: input.mode,
    users: nextUsers,
    notified: [...new Set([...current.notified, ...newlyRevealed])],
  };

  if (sameReveal(current, nextReveal)) return;

  await region.update(buildPoiRegionRevealUpdate(nextReveal));

  if (newlyRevealed.length === 0) return;
  try {
    await deps.publishNotice(newlyRevealed);
  } catch (error) {
    console.warn(`${SYSTEM_ID} | POI reveal notice not delivered`, error);
  }
}
