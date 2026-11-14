import type { CheckExtraDieInput, CheckInput, CheckStepAdjustments } from "../../core/checks/check";
import type { CheckAbilityUseReference } from "./check-ability-use-state";
import type { SkillDieStep } from "../../config/skills";
import type { AttributeKey } from "../../core/actors/agent-attributes";
import type { DieStep } from "../../core/dice/die-step";
import { isCustomSkillKey, readSkillDie, type CustomSkillOption, type CustomSkillValues } from "../../core/actors/custom-skills";
import {
  buildActorAttributeChoices,
  buildActorCheck,
  parseActorCheckSelection,
  type ActorAttributeChoice,
  type ActorCheckSelection,
  type Localize,
} from "./build-actor-check";

export type { Localize } from "./build-actor-check";
export type AgentAttributeChoice = ActorAttributeChoice;
export type AgentCheckSelection = ActorCheckSelection;

export interface AgentCheckChoices {
  readonly difficulty?: number;
  readonly selectedAttribute?: AttributeKey;
  readonly stepAdjustments: CheckStepAdjustments;
  readonly extraDice: readonly CheckExtraDieInput[];
  readonly abilityUses: readonly CheckAbilityUseReference[];
}

export interface AgentCheckSource {
  readonly attributes: Readonly<Record<AttributeKey, DieStep>>;
  readonly customSkills?: CustomSkillValues;
  readonly customSkillOptions?: readonly CustomSkillOption[];
  readonly skills: Readonly<
    Record<string, SkillDieStep | Readonly<Record<string, SkillDieStep>>>
  >;
}

export function getAgentSkillDie(source: AgentCheckSource, selection: Exclude<AgentCheckSelection, { kind: "attribute" }>): SkillDieStep | undefined {
  if (selection.kind === "skill") return readSkillDie(isCustomSkillKey(selection.key)
    ? source.customSkills?.[selection.key] : source.skills[selection.key]);
  const aptitude = source.skills.aptitude;
  return typeof aptitude === "object" ? aptitude[selection.key] : undefined;
}

export function parseAgentCheckSelection(
  kind: string | undefined,
  key: string | undefined,
): AgentCheckSelection {
  if (!key) throw new Error("Missing Agent check key.");
  const selection = kind && parseActorCheckSelection(kind, key);
  if (!selection) throw new Error(`Unknown Agent check selection: ${kind ?? ""}/${key}`);
  return selection;
}

export function buildAgentAttributeChoices(
  source: AgentCheckSource,
  localize: Localize,
): readonly AgentAttributeChoice[] {
  return buildActorAttributeChoices(source.attributes, localize);
}

export function buildAgentCheck(
  selection: AgentCheckSelection,
  source: AgentCheckSource,
  localize: Localize,
  selectedAttribute?: AttributeKey,
): CheckInput {
  return buildActorCheck(selection, {
    attributes: source.attributes,
    customSkillOptions: source.customSkillOptions,
    getSkillDie: skill => getAgentSkillDie(source, skill),
  }, localize, selectedAttribute);
}
