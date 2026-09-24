import { isSkillKey, SKILL_DEFINITIONS } from "../config/skills";
import { POINT_OF_INTEREST_ITEM_TYPE, SYSTEM_ID } from "../config/system-config";
import { managedDigest, stableSerialize } from "../core/adventure-import/adventure-agent-reconciliation";
import {
  isPointOfInterestInformationList,
  type PointOfInterestApproach,
  type PointOfInterestInformation,
  type PointOfInterestSystemData,
} from "../documents/item/point-of-interest-data";

const IMPORT_FLAG = "adventureImport";
const KNOWLEDGE_FLAG = "pointOfInterestKnowledge";
const IMPORT_PATH = `flags.${SYSTEM_ID}.${IMPORT_FLAG}`;
const KNOWLEDGE_PATH = `flags.${SYSTEM_ID}.${KNOWLEDGE_FLAG}`;

type AliasPair = readonly [retired: string, canonical: string];
const KNOWN_ALIASES: Readonly<Record<string, readonly AliasPair[]>> = {
  "actOne.character.tattoo": [["scarAgeSurvival", "scarAgeMedicine"]],
  "actOne.map.22": [["emailBoxTechnology", "emailBoxResearch"]],
  "actTwo.map.24": [
    ["emailBoxTechnology", "emailBoxResearch"],
    ["meetingDateTechnology", "meetingDateResearch"],
  ],
};

interface LegacyEntry {
  readonly id: string;
  readonly difficulty: number;
  readonly content: string;
  readonly showDifficultyToPlayers: boolean;
}
interface LegacyGroup { readonly skill: string; readonly information: readonly LegacyEntry[] }
interface LegacySystem {
  readonly publicDescription: string;
  readonly gmContext: string;
  readonly skills: readonly LegacyGroup[];
}
interface MigrationIssue { readonly uuid: string; readonly reason: string }
interface Plan {
  readonly item: foundry.documents.Item;
  readonly system: PointOfInterestSystemData;
  readonly flag?: Record<string, unknown>;
  readonly knowledge?: unknown;
}

export class PoiMigrationPreflightError extends Error {
  constructor(readonly issues: readonly MigrationIssue[]) {
    super(`Migration 3: ${issues.map(issue => `${issue.uuid}: ${issue.reason}`).join("; ")}`);
    this.name = "PoiMigrationPreflightError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function keysAre(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
function sourceSystem(item: foundry.documents.Item): Record<string, unknown> {
  const source = item.toObject(true) as unknown as { system?: unknown };
  const system = record(source.system);
  if (!system) throw new Error("system ausente ou inválido");
  return system;
}
function authoredStrings(system: Record<string, unknown>): { publicDescription: string; gmContext: string } {
  if (typeof system.publicDescription !== "string" || typeof system.gmContext !== "string")
    throw new Error("descrição pública ou contexto do GM inválido");
  return { publicDescription: system.publicDescription, gmContext: system.gmContext };
}

function firstAptitudeSpecialization() {
  const aptitude = SKILL_DEFINITIONS.find(definition => definition.key === "aptitude");
  const specialization = aptitude && "specializations" in aptitude
    ? aptitude.specializations[0]?.key : undefined;
  if (!specialization) throw new Error("Aptidão sem especialização canônica no registro");
  return specialization;
}

export function convertLegacyPoiSkills(skills: unknown): readonly PointOfInterestInformation[] {
  if (!Array.isArray(skills)) throw new Error("skills legado não é uma lista");
  const result: PointOfInterestInformation[] = [];
  const seenSkills = new Set<string>();
  const seenIds = new Set<string>();
  for (const value of skills) {
    const group = record(value);
    if (!group || !keysAre(group, ["skill", "information"]) || !isSkillKey(group.skill)
      || seenSkills.has(group.skill) || !Array.isArray(group.information)
      || group.information.length === 0) throw new Error("grupo de perícia legado inválido");
    seenSkills.add(group.skill);
    for (const value of group.information) {
      const entry = record(value);
      if (!entry || !keysAre(entry, ["id", "difficulty", "content", "showDifficultyToPlayers"])
        || typeof entry.id !== "string" || !entry.id.trim() || seenIds.has(entry.id)
        || !Number.isInteger(entry.difficulty) || (entry.difficulty as number) < 1
        || typeof entry.content !== "string" || typeof entry.showDifficultyToPlayers !== "boolean")
        throw new Error("informação legada inválida ou ID duplicado");
      seenIds.add(entry.id);
      const approach: PointOfInterestApproach = group.skill === "aptitude"
        ? {
          skill: "aptitude", specialization: firstAptitudeSpecialization(),
          difficulty: entry.difficulty as number,
          showDifficultyToPlayers: entry.showDifficultyToPlayers,
        }
        : {
          skill: group.skill, difficulty: entry.difficulty as number,
          showDifficultyToPlayers: entry.showDifficultyToPlayers,
        };
      result.push({ id: entry.id, content: entry.content, approaches: [approach] });
    }
  }
  return result;
}

function aliasesFor(flag: unknown): readonly AliasPair[] {
  const value = record(flag);
  if (value?.importer !== "pointOfInterest" || value.adventureId !== "playtest-alpha"
    || typeof value.documentId !== "string") return [];
  return KNOWN_ALIASES[value.documentId] ?? [];
}

export function remapKnownPoiKnowledge(raw: unknown, aliases: readonly AliasPair[]): unknown {
  if (!aliases.length || raw === undefined) return raw;
  const flag = record(raw);
  if (!flag || !Array.isArray(flag.agents)) throw new Error("knowledge inválido");
  const mapped = structuredClone(flag);
  const agents = mapped.agents as unknown[];
  for (const value of agents) {
    const entry = record(value);
    if (!entry || typeof entry.actorUuid !== "string" || !/^Actor\.[^.]+$/u.test(entry.actorUuid)
      || !Array.isArray(entry.informationIds)
      || entry.informationIds.some(id => typeof id !== "string" || !id.trim()))
      throw new Error("knowledge de Agent inválido");
    const ids = entry.informationIds as string[];
    entry.informationIds = [...new Set(ids.map(id => aliases.find(([retired]) => retired === id)?.[1] ?? id))];
  }
  return mapped;
}

export function knownPoiAliasesForImport(flag: unknown): readonly AliasPair[] { return aliasesFor(flag); }

function consolidateKnownInformation(
  information: readonly PointOfInterestInformation[], aliases: readonly AliasPair[],
): readonly PointOfInterestInformation[] {
  let result = information.map(entry => ({ ...entry, approaches: [...entry.approaches] }));
  for (const [retired, canonical] of aliases) {
    const oldIndex = result.findIndex(entry => entry.id === retired);
    const targetIndex = result.findIndex(entry => entry.id === canonical);
    const old = result[oldIndex];
    const target = result[targetIndex];
    if (!old && target) continue;
    if (!old || !target || old.content !== target.content)
      throw new Error(`par conhecido não pode ser consolidado: ${retired}`);
    const merged = { ...target, approaches: [...target.approaches, ...old.approaches] };
    result = result.filter(entry => entry.id !== retired && entry.id !== canonical);
    result.splice(Math.min(oldIndex, targetIndex), 0, merged);
  }
  if (!isPointOfInterestInformationList(result)) throw new Error("consolidação inválida");
  return result;
}

async function planItem(item: foundry.documents.Item): Promise<Plan | null> {
  const source = sourceSystem(item);
  const strings = authoredStrings(source);
  const hasLegacy = Object.hasOwn(source, "skills") && source.skills !== undefined;
  if (!hasLegacy) {
    if (!isPointOfInterestInformationList(source.information)) throw new Error("information inválida");
    return null;
  }
  const converted = convertLegacyPoiSkills(source.skills);
  if (source.information !== undefined && (!Array.isArray(source.information)
    || source.information.length > 0 && stableSerialize(source.information) !== stableSerialize(converted)))
    throw new Error("conflito entre skills e information");
  const legacySystem: LegacySystem = { ...strings, skills: source.skills as LegacyGroup[] };
  const rawFlag = item.getFlag(SYSTEM_ID, IMPORT_FLAG);
  const flag = record(rawFlag);
  const clean = flag?.state === "complete" && typeof flag.baseline === "string"
    && await managedDigest(legacySystem) === flag.baseline;
  const aliases = clean ? aliasesFor(flag) : [];
  const information = aliases.length ? consolidateKnownInformation(converted, aliases) : converted;
  const system: PointOfInterestSystemData = { ...strings, information };
  const nextFlag = clean ? { ...flag, baseline: await managedDigest(system) } : undefined;
  const knowledge = aliases.length
    ? remapKnownPoiKnowledge(item.getFlag(SYSTEM_ID, KNOWLEDGE_FLAG), aliases)
    : undefined;
  return { item, system, ...(nextFlag ? { flag: nextFlag } : {}),
    ...(knowledge !== undefined ? { knowledge } : {}) };
}

function collectItems(
  worldItems: Iterable<foundry.documents.Item>, actors: Iterable<foundry.documents.Actor>,
  scenes: Iterable<foundry.documents.Scene>,
): readonly foundry.documents.Item[] {
  const found = new Map<string, foundry.documents.Item>();
  const add = (item: foundry.documents.Item) => {
    if (item.type === POINT_OF_INTEREST_ITEM_TYPE) found.set(item.uuid, item);
  };
  for (const item of worldItems) add(item);
  for (const actor of actors) for (const item of actor.getEmbeddedCollection("Item") as Iterable<foundry.documents.Item>) add(item);
  for (const scene of scenes) for (const token of scene.tokens) {
    if (token.actorLink) continue;
    const delta = token.delta as unknown as {
      toObject(source?: boolean): { items?: readonly { _id?: string }[] };
      getEmbeddedDocument(name: string, id: string): foundry.documents.Item | undefined;
    } | null;
    if (!delta) continue;
    for (const entry of delta.toObject(true).items ?? []) {
      if (typeof entry._id !== "string") continue;
      const item = delta.getEmbeddedDocument("Item", entry._id);
      if (item) add(item);
    }
  }
  return [...found.values()];
}

export async function preflightPoiInformationMigration(
  worldItems: Iterable<foundry.documents.Item>, actors: Iterable<foundry.documents.Actor>,
  scenes: Iterable<foundry.documents.Scene>,
): Promise<readonly Plan[]> {
  const plans: Plan[] = [];
  const issues: MigrationIssue[] = [];
  for (const item of collectItems(worldItems, actors, scenes)) {
    try {
      const plan = await planItem(item);
      if (plan) plans.push(plan);
    } catch (error) {
      issues.push({ uuid: item.uuid, reason: error instanceof Error ? error.message : "erro desconhecido" });
    }
  }
  if (issues.length) throw new PoiMigrationPreflightError(issues);
  return plans;
}

export async function applyPoiInformationMigration(plans: readonly Plan[]): Promise<void> {
  for (const plan of plans) {
    const update: Record<string, unknown> = {
      system: foundry.data.operators.ForcedReplacement.create(structuredClone(plan.system)),
    };
    if (plan.flag) update[IMPORT_PATH] = foundry.data.operators.ForcedReplacement.create(structuredClone(plan.flag));
    if (plan.knowledge !== undefined)
      update[KNOWLEDGE_PATH] = foundry.data.operators.ForcedReplacement.create(structuredClone(plan.knowledge));
    await plan.item.update(update);
    // The optional schema field can exist as `undefined` in memory; JSON serialization omits it.
    const persisted = JSON.parse(JSON.stringify(sourceSystem(plan.item))) as Record<string, unknown>;
    if (Object.hasOwn(persisted, "skills") || stableSerialize(persisted) !== stableSerialize(plan.system))
      throw new Error(`Migration 3: persistência não confirmada em ${plan.item.uuid}`);
    if (plan.flag && stableSerialize(plan.item.getFlag(SYSTEM_ID, IMPORT_FLAG)) !== stableSerialize(plan.flag))
      throw new Error(`Migration 3: baseline não confirmada em ${plan.item.uuid}`);
    if (plan.knowledge !== undefined && stableSerialize(plan.item.getFlag(SYSTEM_ID, KNOWLEDGE_FLAG)) !== stableSerialize(plan.knowledge))
      throw new Error(`Migration 3: knowledge não confirmado em ${plan.item.uuid}`);
  }
}

export async function migratePoiInformation(
  worldItems: Iterable<foundry.documents.Item>, actors: Iterable<foundry.documents.Actor>,
  scenes: Iterable<foundry.documents.Scene>,
): Promise<void> {
  const plans = await preflightPoiInformationMigration(worldItems, actors, scenes);
  await applyPoiInformationMigration(plans);
}
