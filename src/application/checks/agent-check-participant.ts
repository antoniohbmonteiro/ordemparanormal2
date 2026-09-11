export type AgentCheckParticipantReference =
  | {
      readonly kind: "actor";
      readonly uuid: `Actor.${string}`;
    }
  | {
      readonly kind: "token";
      readonly uuid: `Scene.${string}.Token.${string}`;
    };

export function areAgentCheckParticipantReferencesEqual(
  left: AgentCheckParticipantReference,
  right: AgentCheckParticipantReference,
): boolean {
  return left.kind === right.kind && left.uuid === right.uuid;
}

export function encodeAgentCheckParticipantReference(
  reference: AgentCheckParticipantReference,
): string {
  return `${reference.kind}|${reference.uuid}`;
}

export function parseAgentCheckParticipantReference(
  value: string,
): AgentCheckParticipantReference {
  const separatorIndex = value.indexOf("|");
  const kind = value.slice(0, separatorIndex);
  const uuid = value.slice(separatorIndex + 1);

  if (kind === "actor" && /^Actor\.[^.]+$/.test(uuid)) {
    return { kind, uuid: uuid as `Actor.${string}` };
  }

  if (kind === "token" && /^Scene\.[^.]+\.Token\.[^.]+$/.test(uuid)) {
    return { kind, uuid: uuid as `Scene.${string}.Token.${string}` };
  }

  throw new Error("Invalid Agent Check participant reference.");
}
