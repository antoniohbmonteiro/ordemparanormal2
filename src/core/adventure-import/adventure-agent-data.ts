import { AGENT_ATTRIBUTE_KEYS, type AttributeKey } from "../actors/agent-attributes";
import { isDieStep, NORMAL_DIE_STEPS, type DieStep, type NormalDieStep } from "../dice/die-step";
import type { AdventureAct } from "./recognize-zip-source";

export interface AdventureSkillDefinition { readonly key: string; readonly specializations?: readonly { readonly key: string }[] }
export type AgentPresetSkills<R extends readonly AdventureSkillDefinition[] = readonly AdventureSkillDefinition[]> = string extends R[number]["key"]
  ? Readonly<Record<string, NormalDieStep | Readonly<Record<string, NormalDieStep>>>> : {
  readonly [D in R[number] as D["key"]]: D extends { readonly specializations: readonly { readonly key: string }[] }
    ? Readonly<Record<D["specializations"][number]["key"], NormalDieStep>> : NormalDieStep;
};
export interface AdventureCanonicalItemReference { readonly name: string; readonly uuid: string }
export interface AdventureAgentPreset<R extends readonly AdventureSkillDefinition[] = readonly AdventureSkillDefinition[]> {
  readonly schemaVersion: 1; readonly id: string; readonly act: AdventureAct; readonly name: string; readonly level: number;
  readonly resources: { readonly healthMax: number; readonly determinationMax: number };
  readonly attributes: Readonly<Record<AttributeKey, DieStep>>;
  readonly skills: AgentPresetSkills<R>;
  readonly profile: AdventureCanonicalItemReference; readonly occupation: AdventureCanonicalItemReference;
  readonly abilities: readonly AdventureCanonicalItemReference[];
  readonly portraitAssetId: string; readonly tokenAssetId: string;
  readonly profileGrantReplacements?: readonly { readonly grantUuid: string; readonly replacementUuid: string }[];
}
export function adventureDataRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export class InvalidAdventureAgentDataError extends Error {
  constructor(readonly fields: readonly string[]) {
    super(`Invalid adventure Agent fields: ${fields.join(", ")}`);
    this.name = "InvalidAdventureAgentDataError";
  }
}
const nonblank = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const natural = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const normal = (v: unknown) => NORMAL_DIE_STEPS.includes(v as NormalDieStep);

export function validateAdventureAgentData<R extends readonly AdventureSkillDefinition[]>(value: unknown, registry: R): asserts value is AdventureAgentPreset<R> {
  const issues: string[] = [];
  function object(v: unknown, keys: readonly string[], path: string) {
    const record = adventureDataRecord(v);
    if (!record) issues.push(path);
    else for (const key of Object.keys(record)) if (!keys.includes(key)) issues.push(`${path}.${key}`);
    return record ?? {};
  }
  const data = object(value, ["schemaVersion", "id", "act", "name", "level", "resources", "attributes", "skills", "profile", "occupation", "abilities", "portraitAssetId", "tokenAssetId", "profileGrantReplacements"], "preset");
  if (data.schemaVersion !== 1) issues.push("schemaVersion");
  for (const key of ["id", "name", "portraitAssetId", "tokenAssetId"]) if (!nonblank(data[key])) issues.push(key);
  if (data.act !== "actOne" && data.act !== "actTwo") issues.push("act");
  if (!nonblank(data.id) || !data.id.startsWith(`${data.act}.`)) issues.push("id");
  if (!natural(data.level) || (data.level as number) < 1 || (data.level as number) > 10) issues.push("level");
  const resources = object(data.resources, ["healthMax", "determinationMax"], "resources");
  for (const key of ["healthMax", "determinationMax"]) if (!natural(resources[key])) issues.push(`resources.${key}`);
  const attributes = object(data.attributes, AGENT_ATTRIBUTE_KEYS, "attributes");
  for (const key of AGENT_ATTRIBUTE_KEYS) if (!isDieStep(attributes[key])) issues.push(`attributes.${key}`);
  const skills = object(data.skills, registry.map(d => d.key), "skills");
  for (const skill of registry) {
    if (!skill.specializations) { if (!normal(skills[skill.key])) issues.push(`skills.${skill.key}`); }
    else {
      const spec = object(skills[skill.key], skill.specializations.map(d => d.key), `skills.${skill.key}`);
      for (const { key } of skill.specializations) if (!normal(spec[key])) issues.push(`skills.${skill.key}.${key}`);
    }
  }
  function reference(v: unknown, type: string, path: string) {
    const ref = object(v, ["name", "uuid"], path);
    if (!nonblank(ref.name)) issues.push(`${path}.name`);
    if (typeof ref.uuid !== "string" || !ref.uuid.startsWith(`Compendium.ordemparanormal2.${type}.Item.`) || !/^Compendium\.ordemparanormal2\.[a-z]+\.Item\.[A-Za-z0-9]+$/.test(ref.uuid)) issues.push(`${path}.uuid`);
    return ref.uuid;
  }
  reference(data.profile, "profiles", "profile"); reference(data.occupation, "occupations", "occupation");
  const uuids = new Set<unknown>();
  if (!Array.isArray(data.abilities)) issues.push("abilities");
  else for (const [i, ref] of data.abilities.entries()) {
    const uuid = reference(ref, "abilities", `abilities.${i}`);
    if (uuids.has(uuid)) issues.push(`abilities.${i}.duplicate`);
    uuids.add(uuid);
  }
  if (Object.hasOwn(data, "profileGrantReplacements")) {
    const replacements = data.profileGrantReplacements;
    if (!Array.isArray(replacements)) issues.push("profileGrantReplacements");
    else {
      const originals = new Set<unknown>(), targets = new Set<unknown>();
      for (const [i, v] of replacements.entries()) {
        const path = `profileGrantReplacements.${i}`;
        const ref = object(v, ["grantUuid", "replacementUuid"], path);
        for (const key of ["grantUuid", "replacementUuid"]) if (typeof ref[key] !== "string" || !/^Compendium\.ordemparanormal2\.abilities\.Item\.[A-Za-z0-9]+$/.test(ref[key] as string)) issues.push(`${path}.${key}`);
        if (originals.has(ref.grantUuid) || targets.has(ref.replacementUuid) || ref.grantUuid === ref.replacementUuid || !uuids.has(ref.replacementUuid)) issues.push(path);
        originals.add(ref.grantUuid); targets.add(ref.replacementUuid);
      }
    }
  }
  if (issues.length) throw new InvalidAdventureAgentDataError(issues);
}
