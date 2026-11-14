import { SKILL_DEFINITIONS, type SkillDieStep } from "../../config/skills";
import { AGENT_ATTRIBUTE_KEYS, type AttributeKey } from "./agent-attributes";
import { NORMAL_DIE_STEPS } from "../dice/die-step";

export type CustomSkillId = `custom_${string}`;
export type CustomSpecializationId = `spec_${string}`;
export type CustomSkillKey = CustomSkillId | `${CustomSkillId}_${CustomSpecializationId}`;
export type CustomSkillValues = Readonly<Partial<Record<CustomSkillKey, SkillDieStep | null>>>;

interface NamedEntry {
  readonly name: string;
  readonly archived: boolean;
}

export interface CustomSpecialization extends NamedEntry {
  readonly id: CustomSpecializationId;
}

export type CustomSkillDefinition = NamedEntry & {
  readonly id: CustomSkillId;
  readonly baseAttribute: AttributeKey;
  readonly revision: number;
} & ({ readonly kind: "simple" } | {
  readonly kind: "specialized";
  readonly specializations: readonly CustomSpecialization[];
});

export interface CustomSkillCatalog {
  readonly version: 1;
  readonly definitions: readonly CustomSkillDefinition[];
}

export const EMPTY_CUSTOM_SKILL_CATALOG: CustomSkillCatalog = { version: 1, definitions: [] };

export function isCustomSkillKey(value: unknown): value is CustomSkillKey {
  return typeof value === "string" && /^custom_[a-zA-Z0-9]{16}(?:_spec_[a-zA-Z0-9]{16})?$/u.test(value);
}

export function isCustomSkillId(value: unknown): value is CustomSkillId {
  return typeof value === "string" && /^custom_[a-zA-Z0-9]{16}$/u.test(value);
}

export function isCustomSpecializationId(value: unknown): value is CustomSpecializationId {
  return typeof value === "string" && /^spec_[a-zA-Z0-9]{16}$/u.test(value);
}

export function customSkillKey(id: CustomSkillId, specialization?: CustomSpecializationId): CustomSkillKey {
  return specialization ? `${id}_${specialization}` : id;
}

export function isCustomSpecializationKey(key: string): boolean {
  return isCustomSkillKey(key) && !isCustomSkillId(key);
}

export function splitCustomSkillKey(key: CustomSkillKey): { skill: CustomSkillId; specialization?: CustomSpecializationId } {
  const index = key.indexOf("_spec_");
  const skill = index < 0 ? key : key.slice(0, index);
  const specialization = index < 0 ? undefined : key.slice(index + 1);
  if (!isCustomSkillId(skill)) throw new Error("Invalid custom skill key.");
  return { skill, ...(isCustomSpecializationId(specialization) ? { specialization } : {}) };
}

export function readSkillDie(value: unknown): SkillDieStep | undefined {
  return NORMAL_DIE_STEPS.find(die => die === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function namedEntry(value: Record<string, unknown>): NamedEntry | undefined {
  const { name, archived } = value;
  return typeof name === "string" && normalizeSkillName(name) && typeof archived === "boolean"
    ? { name: name.trim().replace(/\s+/gu, " "), archived } : undefined;
}

export function normalizeSkillName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

function uniqueEntries(entries: readonly (NamedEntry & { readonly id: string })[]): boolean {
  return new Set(entries.map(({ id }) => id)).size === entries.length
    && new Set(entries.map(({ name }) => normalizeSkillName(name))).size === entries.length;
}

export function readCustomSkillDefinition(value: unknown): CustomSkillDefinition | undefined {
  if (!isRecord(value)) return;
  const { id, kind, revision } = value;
  const entry = namedEntry(value);
  const baseAttribute = AGENT_ATTRIBUTE_KEYS.find(key => key === value.baseAttribute);
  if (!entry || !isCustomSkillId(id) || !baseAttribute || typeof revision !== "number"
    || !Number.isSafeInteger(revision) || revision < 1) return;
  const base = { ...entry, id, baseAttribute, revision };
  if (kind === "simple") return value.specializations === undefined ? { ...base, kind } : undefined;
  if (kind !== "specialized" || !Array.isArray(value.specializations) || !value.specializations.length) return;
  const specializations: CustomSpecialization[] = [];
  for (const candidate of value.specializations) {
    if (!isRecord(candidate) || !isCustomSpecializationId(candidate.id)) return;
    const specialization = namedEntry(candidate);
    if (!specialization) return;
    specializations.push({ ...specialization, id: candidate.id });
  }
  return uniqueEntries(specializations) ? { ...base, kind, specializations } : undefined;
}

const canonicalNames = new Set(SKILL_DEFINITIONS.map(({ label }) => normalizeSkillName(label)));

export function readCustomSkillCatalog(value: unknown): CustomSkillCatalog | undefined {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.definitions)) return;
  const definitions: CustomSkillDefinition[] = [];
  for (const candidate of value.definitions) {
    const definition = readCustomSkillDefinition(candidate);
    if (!definition || canonicalNames.has(normalizeSkillName(definition.name))) return;
    definitions.push(definition);
  }
  return uniqueEntries(definitions) ? { version: 1, definitions } : undefined;
}

export interface CustomSkillOption {
  readonly key: CustomSkillKey;
  readonly definitionId: CustomSkillId;
  readonly label: string;
  readonly componentLabel: string;
  readonly baseAttribute: AttributeKey;
  readonly specialized: boolean;
  readonly archived: boolean;
}

export function listCustomSkillOptions(catalog: CustomSkillCatalog): readonly CustomSkillOption[] {
  return catalog.definitions.flatMap<CustomSkillOption>(definition => {
    const { id: definitionId, baseAttribute, archived, name } = definition;
    return definition.kind === "simple"
      ? [{ key: definitionId, definitionId, label: name, componentLabel: name, baseAttribute, archived, specialized: false }]
      : definition.specializations.map(specialization => ({
          key: customSkillKey(definitionId, specialization.id), definitionId, baseAttribute,
          label: `${name}: ${specialization.name}`, componentLabel: specialization.name,
          archived: archived || specialization.archived, specialized: true,
        }));
  });
}

export function findCustomSkillImportMatch(catalog: CustomSkillCatalog, id: CustomSkillId | undefined, name: string) {
  const byId = catalog.definitions.find(definition => definition.id === id);
  const normalized = normalizeSkillName(name);
  if (byId && normalizeSkillName(byId.name) === normalized) return { status: "matched" as const, definition: byId };
  const candidates = catalog.definitions.filter(definition => normalizeSkillName(definition.name) === normalized);
  return { status: "review" as const, ...(byId ? { conflict: byId } : {}), candidates };
}
