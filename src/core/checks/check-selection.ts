import { SKILL_DEFINITIONS, type AptitudeSpecializationKey, type SkillKey } from "../../config/skills";
import { AGENT_ATTRIBUTE_KEYS, type AttributeKey } from "../actors/agent-attributes";
import { isCustomSkillKey, type CustomSkillKey } from "../actors/custom-skills";

export type SkillCheckSelection =
  | { readonly kind: "skill"; readonly key: Exclude<SkillKey, "aptitude"> | CustomSkillKey }
  | { readonly kind: "aptitude"; readonly key: AptitudeSpecializationKey };

export type ActorCheckSelection =
  | { readonly kind: "attribute"; readonly key: AttributeKey }
  | SkillCheckSelection;

export function parseActorCheckSelection(kind: string, key: string): ActorCheckSelection | undefined {
  if (kind === "attribute") {
    const attribute = AGENT_ATTRIBUTE_KEYS.find((candidate) => candidate === key);
    return attribute ? { kind, key: attribute } : undefined;
  }
  if (kind === "skill" && isCustomSkillKey(key)) return { kind, key };
  for (const definition of SKILL_DEFINITIONS) {
    if ("specializations" in definition) {
      if (kind !== "aptitude") continue;
      const specialization = definition.specializations.find((candidate) => candidate.key === key);
      if (specialization) return { kind, key: specialization.key };
    } else if (kind === "skill" && definition.key === key) {
      return { kind, key: definition.key };
    }
  }
}
