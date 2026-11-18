
import { BETA_APTITUDES, betaSkillReference, normalizeBetaLabel } from "./parse-playtest-beta";
import type { PreparedBetaMission } from "./prepare-playtest-beta";
import { isSkillKey, skillLabel } from "../../config/skills";
import { customSkillKey, findCustomSkillImportMatch, type CustomSkillCatalog, type CustomSkillDefinition,
  type CustomSkillKey } from "../../core/actors/custom-skills";

export const BETA_SKILL_DEFINITIONS: readonly CustomSkillDefinition[] = [
  { id: "custom_BetaAnimal000001", name: "Animais", kind: "simple", baseAttribute: "emotion", archived: false, revision: 1 },
  { id: "custom_BetaInspect00001", name: "Inspecionar", kind: "simple", baseAttribute: "mind", archived: false, revision: 1 },
  { id: "custom_BetaCraft0000001", name: "Ofício", kind: "simple", baseAttribute: "mind", archived: false, revision: 1 },
  { id: "custom_BetaMetal0000001", name: "Ofício (Metalurgia)", kind: "simple", baseAttribute: "mind", archived: false, revision: 1 },
  { id: "custom_BetaAptitude0001", name: "Aptidão Beta", kind: "specialized", baseAttribute: "mind", archived: false, revision: 1,
    specializations: BETA_APTITUDES.map((name, index) => ({ id: "spec_BetaAptitude000" + (index + 1) as `spec_${string}`, name, archived: false })) },
];

export interface BetaSkillOccurrence {
  id: string;
  document: string;
  source: string;
  page: number;
  label: string;
  value: number;
  kind: "die" | "difficulty";
}

function betaSkillOccurrences(missions: readonly PreparedBetaMission[]) {
  const entries = new Map<string, BetaSkillOccurrence>();
  for (const mission of missions) {
    for (const agent of mission.agents) for (const skill of agent.skills) {
      const id = agent.id + ":" + skill.reference.key;
      if (!entries.has(id)) entries.set(id, { id, document: agent.name,
        source: "Fichas", page: agent.page, label: skill.label, value: skill.die, kind: "die" });
    }
    for (const poi of mission.pois) for (const row of poi.rows) for (const label of row.labels) {
      const ref = betaSkillReference(label);
      if (!ref) continue;
      const id = row.id + ":" + ref.key;
      entries.set(id, { id, document: poi.name, source: "PDF principal", page: row.page,
        label, value: row.difficulty, kind: "difficulty" });
    }
  }
  return [...entries.values()];
}

interface Binding {
  skill: string;
  specialization?: string;
  custom?: CustomSkillKey;
}

function bindDefinition(expected: CustomSkillDefinition, actual: CustomSkillDefinition,
  needed: ReadonlySet<string>, bindings: Map<string, Binding>) {
  if (actual.archived || actual.kind !== expected.kind || actual.baseAttribute !== expected.baseAttribute)
    return false;
  if (actual.kind === "simple") {
    bindings.set(normalizeBetaLabel(expected.name), { skill: actual.id, custom: actual.id });
    return true;
  }
  if (expected.kind !== "specialized") return false;
  let compatible = true;
  for (const spec of expected.specializations) {
    const key = "aptitude." + normalizeBetaLabel(spec.name);
    if (!needed.has(key)) continue;
    const match = actual.specializations.find(candidate => normalizeBetaLabel(candidate.name) === normalizeBetaLabel(spec.name));
    if (!match || match.archived || (actual.id === expected.id && spec.id !== match.id)) {
      compatible = false;
      continue;
    }
    bindings.set(key, { skill: actual.id, specialization: match.id, custom: customSkillKey(actual.id, match.id) });
  }
  return compatible;
}

export function planBetaSkills(missions: readonly PreparedBetaMission[], catalog: CustomSkillCatalog, canCreate: boolean) {
  const entries = betaSkillOccurrences(missions);
  const needed = new Set(entries.flatMap(entry => {
    const ref = betaSkillReference(entry.label);
    return ref?.kind === "beta" ? [ref.key] : [];
  }));
  const bindings = new Map<string, Binding>();
  const create: CustomSkillDefinition[] = [];
  const reused: string[] = [];
  const conflicts: { name: string; reason: string }[] = [];

  for (const expected of BETA_SKILL_DEFINITIONS) {
    const used = expected.kind === "simple" ? needed.has(normalizeBetaLabel(expected.name))
      : expected.specializations.some(spec => needed.has("aptitude." + normalizeBetaLabel(spec.name)));
    if (!used) continue;
    const match = findCustomSkillImportMatch(catalog, expected.id, expected.name);
    const actual = match.status === "matched" ? match.definition : match.conflict ? undefined : match.candidates[0];
    if (actual) {
      if (bindDefinition(expected, actual, needed, bindings)) reused.push(actual.name);
      else conflicts.push({ name: expected.name,
        reason: actual.archived ? "A definição está arquivada." : "A estrutura, o atributo ou a especialização cadastrada é incompatível." });
    } else if (match.status === "review" && match.conflict) {
      conflicts.push({ name: expected.name, reason: "O ID reservado já pertence a outra definição." });
    } else if (canCreate) {
      create.push(expected);
      bindDefinition(expected, expected, needed, bindings);
    } else {
      conflicts.push({ name: expected.name, reason: "O mestre precisa de permissão para adicionar a definição ao catálogo." });
    }
  }

  const canonical = [...new Set(entries.flatMap(entry => {
    const ref = betaSkillReference(entry.label);
    return ref?.kind === "canonical" && isSkillKey(ref.key) ? [skillLabel(ref.key)] : [];
  }))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const pending = entries.filter(entry => !resolveBetaSkill(entry.label, bindings));
  return { bindings, create, reused, canonical, conflicts, pending };
}

export function resolveBetaSkill(label: string, bindings: ReadonlyMap<string, Binding>): Binding | undefined {
  const reference = betaSkillReference(label);
  if (reference?.kind === "canonical") return { skill: reference.key };
  return reference?.kind === "beta" ? bindings.get(reference.key) : undefined;
}
