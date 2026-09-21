import { adventureDataRecord as record, type AdventureAgentPreset } from "./adventure-agent-data";

export const ADVENTURE_ACTOR_FLAG_PATH = "flags.ordemparanormal2.adventureImport";
export interface AgentItemSource {
  readonly _id: string;
  readonly type: string;
  readonly name: string;
  readonly img?: string;
  readonly system: Record<string, unknown>;
  readonly flags?: Record<string, unknown>;
  readonly _stats?: Record<string, unknown>;
}
export interface AgentActorSource {
  readonly _id: string;
  readonly type: string;
  readonly name: string;
  readonly img?: string;
  readonly system: Record<string, unknown>;
  readonly prototypeToken?: Record<string, unknown>;
  readonly folder?: string | null;
  readonly flags?: Record<string, unknown>;
  readonly items: readonly AgentItemSource[];
}
export interface AgentItemImportFlag {
  readonly importer: "actorItem";
  readonly adventureId: string;
  readonly documentId: string;
  readonly uuid: string;
  readonly version: 1;
}
export interface AgentBaseline {
  readonly digest: string;
  readonly items: readonly { readonly id: string; readonly uuid: string; readonly type: string; readonly digest: string }[];
  readonly manualUuids: readonly string[];
}
export interface AgentImportFlag {
  readonly importer: "actor"; readonly adventureId: string; readonly documentId: string; readonly version: 1;
  readonly presetId: string; readonly presetRevision: number; readonly edition: string; readonly act: "actOne" | "actTwo";
  readonly portraitAssetId: string; readonly tokenAssetId: string;
  readonly state: "incomplete" | "complete"; readonly baseline?: AgentBaseline;
}
export function importFlag(source: { readonly flags?: Record<string, unknown> }): Record<string, unknown> | null {
  return record(record(source.flags?.ordemparanormal2)?.adventureImport);
}
export function abilityGrant(item: AgentItemSource): { profileItemId: string; abilityUuid: string } | null {
  const grant = record(record(item.flags?.ordemparanormal2)?.profileGrant);
  return typeof grant?.profileItemId === "string" && grant.profileItemId.length > 0 && typeof grant.abilityUuid === "string" && grant.abilityUuid.length > 0
    ? { profileItemId: grant.profileItemId, abilityUuid: grant.abilityUuid } : null;
}
export function itemSourceUuid(item: AgentItemSource): string | null {
  const uuid = abilityGrant(item)?.abilityUuid ?? record(item.flags?.ordemparanormal2)?.sourceUuid
    ?? item._stats?.compendiumSource ?? item._stats?.duplicateSource;
  return typeof uuid === "string" && uuid.length > 0 ? uuid : null;
}
export function managedItems(actor: AgentActorSource, flag: AgentImportFlag): readonly AgentItemSource[] {
  const profileIds = new Set([
    ...actor.items.filter(i => importFlag(i)?.importer === "actorItem" && importFlag(i)?.adventureId === flag.adventureId && importFlag(i)?.documentId === flag.documentId && i.type === "profile").map(i => i._id),
    ...(flag.baseline?.items.filter(i => i.type === "profile").map(i => i.id) ?? []),
  ]);
  return actor.items.filter(item => {
    const f = importFlag(item);
    return (f?.importer === "actorItem" && f.adventureId === flag.adventureId && f.documentId === flag.documentId)
      || (item.type === "ability" && profileIds.has(abilityGrant(item)?.profileItemId ?? ""));
  });
}
export function itemProjection(item: Pick<AgentItemSource, "type" | "name" | "img" | "system">): unknown {
  const system = structuredClone(item.system);
  if (item.type === "ability") {
    const resource = record(system.resource);
    if (resource) delete resource.value;
  }
  return { type: item.type, name: item.name, img: item.img, system };
}
function actorDataProjection(actor: AgentActorSource) {
  const resources = record(actor.system.resources);
  return { level: actor.system.level, attributes: actor.system.attributes, skills: actor.system.skills,
    healthMax: record(resources?.health)?.max, determinationMax: record(resources?.determination)?.max,
    img: actor.img, token: record(actor.prototypeToken?.texture)?.src,
  };
}
export function actorProjection(actor: AgentActorSource): unknown {
  return { ...actorDataProjection(actor),
    selections: actor.items.filter(i => i.type === "profile" || i.type === "occupation").map(i => ({ id: i._id, data: itemProjection(i), flag: importFlag(i) })).sort((a,b) => a.id.localeCompare(b.id)),
  };
}
export function sourceDifferencePaths(actual: unknown, expected: unknown, path: string): readonly string[] {
  if (stableSerialize(actual) === stableSerialize(expected)) return [];
  const left = record(actual), right = record(expected);
  if (!left || !right) return [path];
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
    .flatMap(key => sourceDifferencePaths(left[key], right[key], `${path}.${key}`));
}
export function actorDataDifferences(actor: AgentActorSource, desired: {
  readonly preset: Pick<AdventureAgentPreset, "level" | "attributes" | "skills" | "resources">;
  readonly img: string; readonly token: string;
}): readonly string[] {
  const target = { ...actor, img: desired.img, prototypeToken: { texture: { src: desired.token } }, system: {
    level: desired.preset.level, attributes: desired.preset.attributes, skills: desired.preset.skills,
    resources: { health: { max: desired.preset.resources.healthMax }, determination: { max: desired.preset.resources.determinationMax } },
  } };
  const actual = actorDataProjection(actor), expected = actorDataProjection(target);
  const paths = { level: "system.level", attributes: "system.attributes", skills: "system.skills",
    healthMax: "system.resources.health.max", determinationMax: "system.resources.determination.max",
    img: "img", token: "prototypeToken.texture.src" } as const;
  return (Object.keys(paths) as (keyof typeof paths)[])
    .flatMap(key => sourceDifferencePaths(actual[key], expected[key], paths[key]));
}
export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = record(value);
  if (object) return `{${Object.keys(object).filter(k => object[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableSerialize(object[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export async function managedDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableSerialize(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, "0")).join("");
}
export async function buildAgentBaseline(actor: AgentActorSource, flag: AgentImportFlag, desiredUuids: readonly string[]): Promise<AgentBaseline> {
  const items = managedItems(actor, flag);
  return { digest: await managedDigest(actorProjection(actor)),
    items: await Promise.all(items.map(async i => ({ id: i._id, type: i.type, uuid: String(importFlag(i)?.uuid ?? itemSourceUuid(i)), digest: await managedDigest({ data: itemProjection(i), flag: importFlag(i), grant: abilityGrant(i), uuid: itemSourceUuid(i) }) }))),
    manualUuids: desiredUuids.filter(uuid => actor.items.some(i => i.type === "ability" && itemSourceUuid(i) === uuid && !items.includes(i))),
  };
}
export async function hasAgentDivergence(actor: AgentActorSource, flag: AgentImportFlag): Promise<boolean> {
  if (flag.state !== "complete" || !flag.baseline) return true;
  const current = await buildAgentBaseline(actor, flag, flag.baseline.manualUuids);
  return current.digest !== flag.baseline.digest || stableSerialize([...current.items].sort((a,b) => a.id.localeCompare(b.id))) !== stableSerialize([...flag.baseline.items].sort((a,b) => a.id.localeCompare(b.id)))
    || flag.baseline.manualUuids.some(uuid => !actor.items.some(i => i.type === "ability" && itemSourceUuid(i) === uuid));
}
export function relevantAgentState(actor: AgentActorSource): string {
  return stableSerialize({ actor: actorProjection(actor), flag: importFlag(actor),
    items: actor.items.map(i => ({ id: i._id, type: i.type, uuid: itemSourceUuid(i), flag: importFlag(i), grant: abilityGrant(i), data: i.type === "ability" && (importFlag(i) || abilityGrant(i)) ? itemProjection(i) : undefined })).sort((a,b) => a.id.localeCompare(b.id)) });
}
export function preserveAbilityResourceValue(desired: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(desired);
  const target = record(result.resource), existing = record(current.resource);
  if (target && existing && Object.hasOwn(existing, "value")) target.value = existing.value;
  return result;
}
