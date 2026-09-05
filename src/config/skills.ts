import type { AttributeKey } from "../core/actors/agent-attributes";
import {
  NORMAL_DIE_STEPS,
  type NormalDieStep,
} from "../core/dice/die-step";

export type SkillDieStep = NormalDieStep;

export const SKILL_DIE_STEPS: readonly SkillDieStep[] = NORMAL_DIE_STEPS;

export const DEFAULT_SKILL_DIE: SkillDieStep = 4;

export interface SkillSpecializationDefinition {
  readonly key: string;
  readonly label: string;
}

export interface SkillDefinition {
  readonly key: string;
  readonly label: string;
  readonly baseAttribute: AttributeKey;
  readonly specializations?: readonly SkillSpecializationDefinition[];
}

export const SKILL_DEFINITIONS = [
  {
    key: "acrobatics",
    label: "Acrobacia",
    baseAttribute: "physical",
  },
  {
    key: "aptitude",
    label: "Aptidão",
    baseAttribute: "mind",
    specializations: [
      { key: "arts", label: "Artes" },
      { key: "currentAffairs", label: "Atualidades" },
      { key: "bureaucracy", label: "Burocracia" },
      { key: "exactSciences", label: "Exatas" },
      { key: "humanities", label: "Humanas" },
      { key: "tactics", label: "Tática" },
    ],
  },
  {
    key: "athletics",
    label: "Atletismo",
    baseAttribute: "physical",
  },
  {
    key: "crime",
    label: "Crime",
    baseAttribute: "physical",
  },
  {
    key: "discipline",
    label: "Disciplina",
    baseAttribute: "emotion",
  },
  {
    key: "deception",
    label: "Enganação",
    baseAttribute: "emotion",
  },
  {
    key: "stealth",
    label: "Furtividade",
    baseAttribute: "physical",
  },
  {
    key: "intimidation",
    label: "Intimidar",
    baseAttribute: "emotion",
  },
  {
    key: "intuition",
    label: "Intuição",
    baseAttribute: "emotion",
  },
  {
    key: "fighting",
    label: "Luta",
    baseAttribute: "physical",
  },
  {
    key: "machinery",
    label: "Máquinas",
    baseAttribute: "mind",
  },
  {
    key: "medicine",
    label: "Medicina",
    baseAttribute: "mind",
  },
  {
    key: "occultism",
    label: "Ocultismo",
    baseAttribute: "mind",
  },
  {
    key: "perception",
    label: "Percepção",
    baseAttribute: "mind",
  },
  {
    key: "persuasion",
    label: "Persuasão",
    baseAttribute: "emotion",
  },
  {
    key: "research",
    label: "Pesquisar",
    baseAttribute: "mind",
  },
  {
    key: "marksmanship",
    label: "Pontaria",
    baseAttribute: "physical",
  },
  {
    key: "survival",
    label: "Sobrevivência",
    baseAttribute: "mind",
  },
  {
    key: "technology",
    label: "Tecnologia",
    baseAttribute: "mind",
  },
  {
    key: "vigor",
    label: "Vigor",
    baseAttribute: "physical",
  },
] as const satisfies readonly SkillDefinition[];

export type RegisteredSkillDefinition = (typeof SKILL_DEFINITIONS)[number];

export type SkillKey = RegisteredSkillDefinition["key"];

export const SKILL_KEYS = SKILL_DEFINITIONS.map(
  (definition) => definition.key,
) as readonly SkillKey[];

export function isSkillKey(value: unknown): value is SkillKey {
  return (
    typeof value === "string" &&
    (SKILL_KEYS as readonly string[]).includes(value)
  );
}

type AptitudeDefinition = Extract<
  RegisteredSkillDefinition,
  { readonly key: "aptitude" }
>;

export type AptitudeSpecializationKey =
  AptitudeDefinition["specializations"][number]["key"];
