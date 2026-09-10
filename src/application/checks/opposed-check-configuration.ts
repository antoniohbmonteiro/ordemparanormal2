import type { AgentCheckSelection } from "./build-agent-check";

export type OpposedCheckParticipantReference =
  | {
      readonly kind: "actor";
      readonly uuid: `Actor.${string}`;
    }
  | {
      readonly kind: "token";
      readonly uuid: `Scene.${string}.Token.${string}`;
    };

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
  return left.kind === right.kind && left.uuid === right.uuid;
}

export function encodeOpposedCheckParticipantReference(
  reference: OpposedCheckParticipantReference,
): string {
  return `${reference.kind}|${reference.uuid}`;
}

export function parseOpposedCheckParticipantReference(
  value: string,
): OpposedCheckParticipantReference {
  const separatorIndex = value.indexOf("|");
  const kind = value.slice(0, separatorIndex);
  const uuid = value.slice(separatorIndex + 1);

  if (kind === "actor" && /^Actor\.[^.]+$/.test(uuid)) {
    return { kind, uuid: uuid as `Actor.${string}` };
  }

  if (kind === "token" && /^Scene\.[^.]+\.Token\.[^.]+$/.test(uuid)) {
    return { kind, uuid: uuid as `Scene.${string}.Token.${string}` };
  }

  throw new Error("Invalid Opposed Check participant reference.");
}
