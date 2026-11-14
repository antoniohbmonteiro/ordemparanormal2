import { ATTRIBUTE_DEFINITIONS, getAttributeDefinition } from "../../config/attributes";
import { aptitudeSpecializationLabel, SKILL_DEFINITIONS, type SkillDieStep } from "../../config/skills";
import type { AttributeKey } from "../../core/actors/agent-attributes";
import { composeAttributeCheck, composeSkillCheck, type CheckInput } from "../../core/checks/check";
import type { ActorCheckSelection, SkillCheckSelection } from "../../core/checks/check-selection";
import type { DieStep } from "../../core/dice/die-step";
import { isCustomSpecializationKey, type CustomSkillOption } from "../../core/actors/custom-skills";

export function skillCheckComponentKind(selection: SkillCheckSelection): "skill" | "specialization" {
  return selection.kind === "aptitude" || isCustomSpecializationKey(selection.key) ? "specialization" : "skill";
}

export function matchesSkillCheckComponents(
  selection: SkillCheckSelection, components: readonly Pick<CheckInput["components"][number], "kind" | "key">[],
): boolean {
  const skill = components[1];
  return components.length === 2 && components[0]?.kind === "attribute"
    && skill?.kind === skillCheckComponentKind(selection) && skill.key === selection.key;
}

export class MissingActorSkillError extends Error {
  constructor(key: string) {
    super(`O personagem não possui a perícia solicitada ou sua definição está indisponível (${key}).`);
    this.name = "MissingActorSkillError";
  }
}

export { parseActorCheckSelection } from "../../core/checks/check-selection";
export type { ActorCheckSelection, SkillCheckSelection } from "../../core/checks/check-selection";

export interface ActorCheckSkill {
  readonly selection: SkillCheckSelection;
  readonly label: string;
  readonly baseAttribute: AttributeKey;
}

export const ACTOR_CHECK_SKILLS: readonly ActorCheckSkill[] = SKILL_DEFINITIONS.flatMap<ActorCheckSkill>(
  (definition) => "specializations" in definition
    ? definition.specializations.map(({ key, label }) => ({
        selection: { kind: "aptitude", key },
        label: `${definition.label}: ${label}`,
        baseAttribute: definition.baseAttribute,
      }))
    : [{
        selection: { kind: "skill", key: definition.key },
        label: definition.label,
        baseAttribute: definition.baseAttribute,
      }],
);

export function findActorCheckSkill(kind: string, key: string, custom: readonly CustomSkillOption[] = []): ActorCheckSkill | CustomSkillOption | undefined {
  const canonical = ACTOR_CHECK_SKILLS.find(({ selection }) => selection.kind === kind && selection.key === key);
  return canonical ?? (kind === "skill" ? custom.find(option => option.key === key) : undefined);
}

export interface ActorCheckSource {
  readonly attributes: Readonly<Record<AttributeKey, DieStep>>;
  readonly getSkillDie: (selection: SkillCheckSelection) => SkillDieStep | undefined;
  readonly customSkillOptions?: readonly CustomSkillOption[];
}

export type Localize = (key: string) => string;

export interface ActorAttributeChoice {
  readonly key: AttributeKey;
  readonly label: string;
  readonly die: DieStep;
}

export function buildActorAttributeChoices(
  attributes: ActorCheckSource["attributes"],
  localize: Localize,
): readonly ActorAttributeChoice[] {
  return ATTRIBUTE_DEFINITIONS.map(({ key, labelKey }) => ({
    key, label: localize(labelKey), die: attributes[key],
  }));
}

export function buildActorCheck(
  selection: ActorCheckSelection,
  source: ActorCheckSource,
  localize: Localize,
  selectedAttribute?: AttributeKey,
): CheckInput {
  const attributeComponent = (key: AttributeKey) => ({
    kind: "attribute" as const,
    key,
    label: localize(getAttributeDefinition(key).labelKey),
    die: source.attributes[key],
  });

  if (selection.kind === "attribute") {
    if (selectedAttribute !== undefined) {
      throw new Error("Attribute checks cannot select an alternate attribute.");
    }
    return composeAttributeCheck(attributeComponent(selection.key));
  }

  const definition = findActorCheckSkill(selection.kind, selection.key, source.customSkillOptions);
  const die = source.getSkillDie(selection);
  if (!definition || die === undefined) throw new MissingActorSkillError(selection.key);
  const label = "componentLabel" in definition ? definition.componentLabel
    : selection.kind === "aptitude" ? aptitudeSpecializationLabel(selection.key) : definition.label;
  return composeSkillCheck(
    { ...selection, name: definition.label },
    attributeComponent(selectedAttribute ?? definition.baseAttribute),
    { kind: skillCheckComponentKind(selection), key: selection.key, label, die },
  );
}
