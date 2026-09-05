import type { AgentCheckSource } from "../../../application/checks/build-agent-check";
import { SKILL_DEFINITIONS } from "../../../config/skills";
import { AGENT_ACTOR_TYPE } from "../../../config/system-config";
import { AGENT_ATTRIBUTE_KEYS } from "../../../core/actors/agent-attributes";
import { isDieStep } from "../../../core/dice/die-step";

export function readAgentCheckSource(
  actor: foundry.documents.Actor,
): AgentCheckSource {
  if (actor.type !== AGENT_ACTOR_TYPE) {
    throw new Error(`Cannot perform an Agent check for Actor type ${actor.type}.`);
  }

  const system = actor.system as unknown as {
    readonly attributes: Readonly<Record<string, unknown>>;
    readonly skills: Readonly<Record<string, unknown>>;
  };
  const attributes = Object.fromEntries(
    AGENT_ATTRIBUTE_KEYS.map((key) => {
      const value = system.attributes[key];

      if (!isDieStep(value)) {
        throw new Error(`Invalid die step at system.attributes.${key}.`);
      }

      return [key, value];
    }),
  ) as AgentCheckSource["attributes"];

  const skills = Object.fromEntries(
    SKILL_DEFINITIONS.map((definition) => {
      const value = system.skills[definition.key];

      if ("specializations" in definition) {
        if (typeof value !== "object" || value === null) {
          throw new Error(`Invalid specialized skill ${definition.key}.`);
        }

        return [
          definition.key,
          Object.fromEntries(
            definition.specializations.map(({ key }) => {
              const specializationValue = (value as Record<string, unknown>)[
                key
              ];

              if (
                !isDieStep(specializationValue) ||
                specializationValue === 20
              ) {
                throw new Error(
                  `Invalid skill die at system.skills.${definition.key}.${key}.`,
                );
              }

              return [key, specializationValue];
            }),
          ),
        ];
      }

      if (!isDieStep(value) || value === 20) {
        throw new Error(`Invalid skill die at system.skills.${definition.key}.`);
      }

      return [definition.key, value];
    }),
  ) as AgentCheckSource["skills"];

  return { attributes, skills };
}
