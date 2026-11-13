import type { CheckExtraDieInput, CheckInput, CheckStepAdjustments } from "../../core/checks/check";
import type { CheckAbilityUseReference } from "./check-ability-use-state";
import type { SkillDieStep } from "../../config/skills";
import type { AttributeKey } from "../../core/actors/agent-attributes";
import type { DieStep } from "../../core/dice/die-step";
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
  readonly skills: Readonly<
    Record<string, SkillDieStep | Readonly<Record<string, SkillDieStep>>>
  >;
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
    getSkillDie: ({ kind, key }) => {
      if (kind === "skill") {
        const die = source.skills[key];
        return typeof die === "number" ? die : undefined;
      }
      const aptitude = source.skills.aptitude;
      return typeof aptitude === "object" ? aptitude[key] : undefined;
    },
  }, localize, selectedAttribute);
}
