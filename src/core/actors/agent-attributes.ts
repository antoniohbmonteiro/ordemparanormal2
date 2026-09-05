export const AGENT_ATTRIBUTE_KEYS = ["physical", "mind", "emotion"] as const;

export type AttributeKey = (typeof AGENT_ATTRIBUTE_KEYS)[number];
