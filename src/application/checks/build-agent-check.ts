import {
  ATTRIBUTE_DEFINITIONS,
  getAttributeDefinition,
} from "../../config/attributes";
import {
  SKILL_DEFINITIONS,
  type AptitudeSpecializationKey,
  type SkillDieStep,
  type SkillKey,
} from "../../config/skills";
import {
  AGENT_ATTRIBUTE_KEYS,
  type AttributeKey,
} from "../../core/actors/agent-attributes";
import {
  composeAttributeCheck,
  composeSkillCheck,
  type CheckInput,
} from "../../core/checks/check";
import type { DieStep } from "../../core/dice/die-step";

export type AgentCheckSelection =
  | { readonly kind: "attribute"; readonly key: AttributeKey }
  | { readonly kind: "skill"; readonly key: Exclude<SkillKey, "aptitude"> }
  | { readonly kind: "aptitude"; readonly key: AptitudeSpecializationKey };

export interface AgentCheckSource {
  readonly attributes: Readonly<Record<AttributeKey, DieStep>>;
  readonly skills: Readonly<
    Record<string, SkillDieStep | Readonly<Record<string, SkillDieStep>>>
  >;
}

export interface AgentAttributeChoice {
  readonly key: AttributeKey;
  readonly label: string;
  readonly die: DieStep;
}

export type Localize = (key: string) => string;

function isAttributeKey(value: string): value is AttributeKey {
  return AGENT_ATTRIBUTE_KEYS.some((key) => key === value);
}

export function parseAgentCheckSelection(
  kind: string | undefined,
  key: string | undefined,
): AgentCheckSelection {
  if (!key) {
    throw new Error("Missing Agent check key.");
  }

  if (kind === "attribute" && isAttributeKey(key)) {
    return { kind, key };
  }

  if (kind === "skill") {
    const definition = SKILL_DEFINITIONS.find(
      (candidate) => candidate.key === key && candidate.key !== "aptitude",
    );

    if (definition) {
      return {
        kind,
        key: definition.key as Exclude<SkillKey, "aptitude">,
      };
    }
  }

  if (kind === "aptitude") {
    const aptitude = SKILL_DEFINITIONS.find(
      (definition) => definition.key === "aptitude",
    );
    const specialization = aptitude?.specializations.find(
      (candidate) => candidate.key === key,
    );

    if (specialization) {
      return { kind, key: specialization.key };
    }
  }

  throw new Error(`Unknown Agent check selection: ${kind ?? ""}/${key}`);
}

function buildAttributeComponent(
  key: AttributeKey,
  source: AgentCheckSource,
  localize: Localize,
) {
  const definition = getAttributeDefinition(key);

  return {
    kind: "attribute" as const,
    key,
    label: localize(definition.labelKey),
    die: source.attributes[key],
  };
}

export function buildAgentAttributeChoices(
  source: AgentCheckSource,
  localize: Localize,
): readonly AgentAttributeChoice[] {
  return ATTRIBUTE_DEFINITIONS.map(({ key }) => {
    const { label, die } = buildAttributeComponent(key, source, localize);
    return { key, label, die };
  });
}

export function buildAgentCheck(
  selection: AgentCheckSelection,
  source: AgentCheckSource,
  localize: Localize,
  selectedAttribute?: AttributeKey,
): CheckInput {
  if (selection.kind === "attribute") {
    if (selectedAttribute !== undefined) {
      throw new Error("Attribute checks cannot select an alternate attribute.");
    }

    return composeAttributeCheck(
      buildAttributeComponent(selection.key, source, localize),
    );
  }

  if (selection.kind === "skill") {
    const definition = SKILL_DEFINITIONS.find(
      (candidate) => candidate.key === selection.key,
    );

    if (!definition || "specializations" in definition) {
      throw new Error(`Unknown simple skill: ${selection.key}`);
    }

    return composeSkillCheck(
      { kind: "skill", key: definition.key, name: definition.label },
      buildAttributeComponent(
        selectedAttribute ?? definition.baseAttribute,
        source,
        localize,
      ),
      {
        kind: "skill",
        key: definition.key,
        label: definition.label,
        die: source.skills[definition.key] as SkillDieStep,
      },
    );
  }

  const aptitude = SKILL_DEFINITIONS.find(
    (definition) => definition.key === "aptitude",
  );
  const specialization = aptitude?.specializations.find(
    (candidate) => candidate.key === selection.key,
  );

  if (!aptitude || !specialization) {
    throw new Error(`Unknown Aptitude specialization: ${selection.key}`);
  }

  const aptitudeValues = source.skills[aptitude.key] as Readonly<
    Record<string, SkillDieStep>
  >;

  return composeSkillCheck(
    {
      kind: "aptitude",
      key: specialization.key,
      name: `${aptitude.label}: ${specialization.label}`,
    },
    buildAttributeComponent(
      selectedAttribute ?? aptitude.baseAttribute,
      source,
      localize,
    ),
    {
      kind: "specialization",
      key: specialization.key,
      label: specialization.label,
      die: aptitudeValues[specialization.key],
    },
  );
}
