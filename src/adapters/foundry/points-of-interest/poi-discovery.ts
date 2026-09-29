import { SYSTEM_ID } from "../../../config/system-config";
import type { FlagDocument } from "./poi-runtime-state";

export const POI_DISCOVERY_FLAG = "pointOfInterestDiscovery";
export const POI_DISCOVERY_PATH = `flags.${SYSTEM_ID}.${POI_DISCOVERY_FLAG}`;

export interface PoiDiscovery {
  readonly runId: string;
  readonly actorUuid: string;
  readonly informationId: string;
}

export function readPoiDiscoveries(item: FlagDocument): readonly PoiDiscovery[] {
  const raw = item.getFlag(SYSTEM_ID, POI_DISCOVERY_FLAG);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: PoiDiscovery[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const { runId, actorUuid, informationId } = value as Record<string, unknown>;
    if (typeof runId !== "string" || !runId.trim()
      || typeof actorUuid !== "string" || !/^Actor\.[^.]+$/u.test(actorUuid)
      || typeof informationId !== "string" || !informationId.trim()) continue;
    const key = `${runId}\u0000${actorUuid}\u0000${informationId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ runId, actorUuid, informationId });
  }
  return result;
}
