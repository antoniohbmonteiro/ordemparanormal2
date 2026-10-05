import { POINT_OF_INTEREST_ITEM_TYPE, SYSTEM_ID } from "../../../config/system-config";
import { readPoiRegionAssociation } from "./poi-region-association";

export const POI_SCENE_ITEMS_FLAG = "pointOfInterestItems";
export const POI_VISIBILITY_FLAG = "pointOfInterestVisibility";
export const POI_KNOWLEDGE_FLAG = "pointOfInterestKnowledge";
export const POI_SCENE_ITEMS_PATH = `flags.${SYSTEM_ID}.${POI_SCENE_ITEMS_FLAG}`;
export const POI_VISIBILITY_PATH = `flags.${SYSTEM_ID}.${POI_VISIBILITY_FLAG}`;
export const POI_KNOWLEDGE_PATH = `flags.${SYSTEM_ID}.${POI_KNOWLEDGE_FLAG}`;

export interface FlagDocument { getFlag(scope: string, key: string): unknown }
export interface PoiVisibility {
  readonly mode: "hidden" | "everyone" | "users";
  readonly users: readonly string[];
  readonly notified: readonly string[];
}
export interface PoiKnowledgeEntry {
  readonly actorUuid: string;
  readonly informationIds: readonly string[];
}

export function isWorldPoiUuid(value: unknown): value is string {
  return typeof value === "string" && /^Item\.[^.]+$/u.test(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()))]
    : [];
}

export function readScenePoiUuids(scene: FlagDocument): readonly string[] {
  return strings(scene.getFlag(SYSTEM_ID, POI_SCENE_ITEMS_FLAG)).filter(isWorldPoiUuid);
}

export function readPoiVisibility(item: FlagDocument): PoiVisibility {
  const raw = item.getFlag(SYSTEM_ID, POI_VISIBILITY_FLAG);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { mode: "hidden", users: [], notified: [] };
  const data = raw as Record<string, unknown>;
  const mode = data.mode === "everyone" || data.mode === "users" ? data.mode : "hidden";
  return { mode, users: mode === "users" ? strings(data.users) : [], notified: strings(data.notified) };
}

export function isPoiVisibleTo(visibility: PoiVisibility, userId: string, isGM: boolean): boolean {
  return isGM || visibility.mode === "everyone" || visibility.mode === "users" && visibility.users.includes(userId);
}

export function readPoiKnowledge(item: FlagDocument): readonly PoiKnowledgeEntry[] {
  const raw = item.getFlag(SYSTEM_ID, POI_KNOWLEDGE_FLAG);
  const agents = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as { agents?: unknown }).agents : undefined;
  if (!Array.isArray(agents)) return [];
  const result = new Map<string, string[]>();
  for (const entry of agents) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { actorUuid, informationIds } = entry as { actorUuid?: unknown; informationIds?: unknown };
    if (typeof actorUuid !== "string" || !/^Actor\.[^.]+$/u.test(actorUuid)) continue;
    result.set(actorUuid, [...new Set([...(result.get(actorUuid) ?? []), ...strings(informationIds)])]);
  }
  return [...result].map(([actorUuid, informationIds]) => ({ actorUuid, informationIds }));
}

export function worldPoi(itemUuid: string): foundry.documents.Item | null {
  if (!isWorldPoiUuid(itemUuid)) return null;
  const item = game.items.get(itemUuid.slice(5));
  return item?.uuid === itemUuid && item.type === POINT_OF_INTEREST_ITEM_TYPE && !item.isEmbedded && !item.pack
    ? item : null;
}

export function isGmControlledPoi(item: foundry.documents.Item): boolean {
  const users = (game.users as unknown as { contents: foundry.documents.User[] }).contents;
  const ownership = item.ownership as Record<string, number>;
  return (ownership.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE) < CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED
    && users.every(user => user.isGM || !item.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED));
}

export function associatedRegionIds(scene: foundry.documents.Scene, itemUuid: string): readonly string[] {
  return [...scene.regions]
    .filter(region => readPoiRegionAssociation(region)?.itemUuid === itemUuid)
    .map(region => region.id)
    .filter((id): id is string => !!id);
}
