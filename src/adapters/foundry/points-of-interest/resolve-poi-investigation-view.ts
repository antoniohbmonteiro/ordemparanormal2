import { skillLabel, type SkillKey } from "../../../config/skills";
import {
  playerVisiblePointOfInterestInformation, readPointOfInterestInformation,
  type PointOfInterestApproach, type PointOfInterestInformation, type PoiInvestigationViewData,
} from "../../../documents/item/point-of-interest-data";
import { isGmControlledPoi, isPoiVisibleTo, readPoiKnowledge, readPoiVisibility, readScenePoiUuids, worldPoi } from "./poi-runtime-state";

export interface PoiInvestigationRequest {
  readonly sceneId: string;
  readonly itemUuid: string;
  readonly actorUuid?: string;
  readonly requesterUserId: string;
}
export type PoiInvestigationError = "unavailable" | "forbidden" | "no-gm";
export type PoiInvestigationResult = { readonly view: PoiInvestigationViewData } | { readonly error: PoiInvestigationError };

interface DerivedRow { readonly entry: PointOfInterestInformation; readonly approach: PointOfInterestApproach }
function groupApproaches(information: readonly PointOfInterestInformation[]): ReadonlyMap<SkillKey, readonly DerivedRow[]> {
  const groups = new Map<SkillKey, DerivedRow[]>();
  for (const entry of information) for (const approach of entry.approaches) {
    const rows = groups.get(approach.skill) ?? [];
    rows.push({ entry, approach });
    groups.set(approach.skill, rows);
  }
  return groups;
}

function authorized(request: PoiInvestigationRequest):
  | { item: foundry.documents.Item; user: foundry.documents.User; actor: foundry.documents.Actor | null }
  | { error: PoiInvestigationError } {
  const scene = game.scenes.get(request.sceneId);
  const user = (game.users as unknown as { get(id: string): foundry.documents.User | undefined }).get(request.requesterUserId);
  if (!scene || !user || !readScenePoiUuids(scene).includes(request.itemUuid)) return { error: "unavailable" };
  const item = worldPoi(request.itemUuid);
  if (!item || !isGmControlledPoi(item)) return { error: "unavailable" };
  if (!isPoiVisibleTo(readPoiVisibility(item), user.id, user.isGM)) return { error: "forbidden" };
  let actor: foundry.documents.Actor | null = null;
  if (!user.isGM && request.actorUuid) {
    if (!/^Actor\.[^.]+$/u.test(request.actorUuid)) return { error: "forbidden" };
    actor = game.actors.get(request.actorUuid.slice(6)) ?? null;
    if (!actor || actor.uuid !== request.actorUuid || actor.type !== "agent"
      || !actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return { error: "forbidden" };
  }
  return { item, user, actor };
}

export async function resolvePoiInvestigationView(request: PoiInvestigationRequest): Promise<PoiInvestigationResult> {
  const initial = authorized(request);
  if ("error" in initial) return initial;
  const { item, user, actor } = initial;
  const system = item.system as { publicDescription?: unknown; gmContext?: unknown };
  const descriptionRaw = typeof system.publicDescription === "string" ? system.publicDescription : "";
  const gmRaw = typeof system.gmContext === "string" ? system.gmContext : "";
  const [description, gmContext] = await Promise.all([
    foundry.applications.ux.TextEditor.implementation.enrichHTML(descriptionRaw, { relativeTo: item, secrets: false }),
    user.isGM ? foundry.applications.ux.TextEditor.implementation.enrichHTML(gmRaw, { relativeTo: item, secrets: true }) : "",
  ]);
  const latest = authorized(request);
  if ("error" in latest) return latest;
  const information = readPointOfInterestInformation(latest.item.system);
  const knowledge = readPoiKnowledge(latest.item);
  const known = new Set(knowledge.find(entry => entry.actorUuid === actor?.uuid)?.informationIds ?? []);
  const base = { name: latest.item.name, description, img: latest.item.img ?? "" };
  // A player's groups are built only from information they may receive, so a skill with nothing else is absent.
  const groups = groupApproaches(user.isGM ? information : playerVisiblePointOfInterestInformation(information, known));
  const view: PoiInvestigationViewData = user.isGM
    ? { ...base, audience: "gm", itemUuid: latest.item.uuid, gmContext,
        skills: [...groups].map(([key, rows]) => ({ key, name: skillLabel(key),
          information: rows.map(({ entry, approach }) => ({ id: entry.id, content: entry.content,
            difficulty: approach.difficulty, showDifficultyToPlayers: approach.showDifficultyToPlayers,
            ...(approach.skill === "aptitude" ? { specialization: approach.specialization } : {}),
            ...(entry.availability.mode === "situational" ? { condition: entry.availability.condition } : {}),
            ...(approach.difficultyOverride ? { difficultyOverride: { ...approach.difficultyOverride } } : {}),
            knownCount: knowledge.filter(agent => agent.informationIds.includes(entry.id)).length })) })) }
    : { ...base, audience: "player", skills: [...groups].map(([key, rows]) => ({ key, name: skillLabel(key),
        information: rows.map(({ entry, approach }) => ({
          ...(approach.showDifficultyToPlayers ? { visibility: "public" as const, difficulty: approach.difficulty } : { visibility: "hidden" as const }),
          ...(approach.skill === "aptitude" ? { specialization: approach.specialization } : {}),
          ...(known.has(entry.id) ? { content: entry.content } : {}),
        })) })) };
  return { view };
}
