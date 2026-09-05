import type { AttributeKey } from "../core/actors/agent-attributes";

export interface AttributeDefinition {
  readonly key: AttributeKey;
  readonly labelKey: string;
  readonly abbreviationKey: string;
}

export const ATTRIBUTE_DEFINITIONS = [
  {
    key: "physical",
    labelKey: "ORDEMPARANORMAL2.AgentSheet.Attributes.Physical",
    abbreviationKey: "ORDEMPARANORMAL2.AgentSheet.Attributes.PhysicalShort",
  },
  {
    key: "mind",
    labelKey: "ORDEMPARANORMAL2.AgentSheet.Attributes.Mind",
    abbreviationKey: "ORDEMPARANORMAL2.AgentSheet.Attributes.MindShort",
  },
  {
    key: "emotion",
    labelKey: "ORDEMPARANORMAL2.AgentSheet.Attributes.Emotion",
    abbreviationKey: "ORDEMPARANORMAL2.AgentSheet.Attributes.EmotionShort",
  },
] as const satisfies readonly AttributeDefinition[];

export function getAttributeDefinition(
  key: AttributeKey,
): AttributeDefinition {
  const definition = ATTRIBUTE_DEFINITIONS.find(
    (candidate) => candidate.key === key,
  );

  if (!definition) {
    throw new Error(`Unknown Agent attribute: ${key}`);
  }

  return definition;
}
