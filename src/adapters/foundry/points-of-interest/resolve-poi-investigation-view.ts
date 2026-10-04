import { skillLabel, type SkillKey } from "../../../config/skills";
import {
  approachIdentity, isSkillApproach, isToolApproach, playerVisiblePointOfInterestInformation, readPointOfInterestInformation,
  type PointOfInterestSkillApproach, type PointOfInterestInformation, type PoiInvestigationViewData,
} from "../../../documents/item/point-of-interest-data";
import { isGmControlledPoi, isPoiVisibleTo, readPoiKnowledge, readPoiVisibility, readScenePoiUuids, worldPoi } from "./poi-runtime-state";
import { investigationParticipants, sceneInvestigationRuntime } from "./investigation-runtime";
import { investigationToolInventory } from "../equipment/investigation-tool-inventory";
import { describeToolApproach } from "../equipment/equipment-source";

export interface PoiInvestigationRequest {
  readonly sceneId: string;
  readonly itemUuid: string;
  readonly actorUuid?: string;
  readonly requesterUserId: string;
}
export type PoiInvestigationError = "unavailable" | "forbidden" | "no-gm";
export type PoiInvestigationResult = { readonly view: PoiInvestigationViewData } | { readonly error: PoiInvestigationError };

interface DerivedRow { readonly entry: PointOfInterestInformation; readonly approach: PointOfInterestSkillApproach }
function groupApproaches(information: readonly PointOfInterestInformation[]): ReadonlyMap<SkillKey, readonly DerivedRow[]> {
  const groups = new Map<SkillKey, DerivedRow[]>();
  for (const entry of information) for (const approach of entry.approaches) {
    if (!isSkillApproach(approach)) continue;
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
      || !investigationParticipants(scene).some(participant => participant.uuid === actor?.uuid)
      || !actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return { error: "forbidden" };
  }
  return { item, user, actor };
}

export async function resolvePoiInvestigationView(request: PoiInvestigationRequest): Promise<PoiInvestigationResult> {
  const initial = authorized(request);
  if ("error" in initial) return initial;
  const { item, user } = initial;
  const system = item.system as { publicDescription?: unknown; gmContext?: unknown };
  const descriptionRaw = typeof system.publicDescription === "string" ? system.publicDescription : "";
  const gmRaw = typeof system.gmContext === "string" ? system.gmContext : "";
  const [description, gmContext] = await Promise.all([
    foundry.applications.ux.TextEditor.implementation.enrichHTML(descriptionRaw, { relativeTo: item, secrets: false }),
    user.isGM ? foundry.applications.ux.TextEditor.implementation.enrichHTML(gmRaw, { relativeTo: item, secrets: true }) : "",
  ]);
  const latest = authorized(request);
  if ("error" in latest) return latest;
  const actor = latest.actor;
  const information = readPointOfInterestInformation(latest.item.system);
  const knowledge = readPoiKnowledge(latest.item);
  const known = new Set(knowledge.find(entry => entry.actorUuid === actor?.uuid)?.informationIds ?? []);
  const currentScene = game.scenes.get(request.sceneId);
  const investigationRuntime = currentScene ? sceneInvestigationRuntime(currentScene) : null;
  const base = { name: latest.item.name, description, img: latest.item.img ?? "",
    investigationRunId: investigationRuntime?.runId ?? null };
  const groups = groupApproaches(information);
  const playerGroups = new Map<string, DerivedRow[]>();
  for (const entry of playerVisiblePointOfInterestInformation(information, known)) for (const approach of entry.approaches) {
    if (!isSkillApproach(approach)) continue;
    const key = approachIdentity(approach);
    const rows = playerGroups.get(key) ?? [];
    rows.push({ entry, approach });
    playerGroups.set(key, rows);
  }
  const view: PoiInvestigationViewData = user.isGM
    ? { ...base, audience: "gm", itemUuid: latest.item.uuid, gmContext,
        toolInformation: await Promise.all(information.filter(entry => entry.approaches.some(isToolApproach)).map(async entry => ({
          id: entry.id, content: entry.content, knownCount: knowledge.filter(agent => agent.informationIds.includes(entry.id)).length,
          ...(entry.availability.mode === "situational" ? { condition: entry.availability.condition } : {}),
          approaches: await Promise.all(entry.approaches.filter(isToolApproach).map(approach =>
            describeToolApproach(approach.equipmentUuid, approach.useFormId))),
        }))),
        skills: [...groups].map(([key, rows]) => ({ key, name: skillLabel(key),
          information: rows.map(({ entry, approach }) => ({ id: entry.id, content: entry.content,
            difficulty: approach.difficulty, showDifficultyToPlayers: approach.showDifficultyToPlayers,
            ...(approach.skill === "aptitude" ? { specialization: approach.specialization } : {}),
            ...(entry.availability.mode === "situational" ? { condition: entry.availability.condition } : {}),
            ...(approach.difficultyOverride ? { difficultyOverride: { ...approach.difficultyOverride } } : {}),
            knownCount: knowledge.filter(agent => agent.informationIds.includes(entry.id)).length })) })) }
    : { ...base, audience: "player",
      tools: actor ? investigationToolInventory(actor) : [],
      discoveries: information.filter(entry => known.has(entry.id) && !entry.approaches.some(isSkillApproach))
        .map(entry => ({ content: entry.content })),
      skills: [...playerGroups.values()].map(rows => ({ key: rows[0].approach.skill, name: skillLabel(rows[0].approach.skill),
        ...(rows[0].approach.skill === "aptitude" ? { specialization: rows[0].approach.specialization } : {}),
        publicDifficulties: [...new Set(rows.filter(({ entry, approach }) =>
          approach.showDifficultyToPlayers && (entry.availability.mode === "always" || known.has(entry.id)))
          .map(({ approach }) => approach.difficulty))],
        information: rows.filter(({ entry }) => known.has(entry.id)).map(({ entry, approach }) => ({
          ...(approach.showDifficultyToPlayers ? { visibility: "public" as const, difficulty: approach.difficulty } : { visibility: "hidden" as const }),
          ...(approach.skill === "aptitude" ? { specialization: approach.specialization } : {}),
          content: entry.content,
        })) })) };
  const final = authorized(request);
  if ("error" in final) return final;
  if (final.item !== latest.item || final.user.isGM !== (view.audience === "gm") || final.actor !== actor)
    return { error: "forbidden" };
  return { view };
}
