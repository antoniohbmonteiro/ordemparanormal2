import type { AgentCheckSelection } from "./build-agent-check";
import {
  areAgentCheckParticipantReferencesEqual,
  encodeAgentCheckParticipantReference,
  parseAgentCheckParticipantReference,
  type AgentCheckParticipantReference,
} from "./agent-check-participant";

export type OpposedCheckParticipantReference = AgentCheckParticipantReference;

export interface OpposedCheckParticipantConfiguration {
  readonly participant: OpposedCheckParticipantReference;
  readonly selection: AgentCheckSelection;
}

export interface OpposedCheckDialogResult {
  readonly left: OpposedCheckParticipantConfiguration;
  readonly right: OpposedCheckParticipantConfiguration;
}

export function areOpposedCheckParticipantReferencesEqual(
  left: OpposedCheckParticipantReference,
  right: OpposedCheckParticipantReference,
): boolean {
  return areAgentCheckParticipantReferencesEqual(left, right);
}

export function encodeOpposedCheckParticipantReference(
  reference: OpposedCheckParticipantReference,
): string {
  return encodeAgentCheckParticipantReference(reference);
}

export function parseOpposedCheckParticipantReference(
  value: string,
): OpposedCheckParticipantReference {
  return parseAgentCheckParticipantReference(value);
}
