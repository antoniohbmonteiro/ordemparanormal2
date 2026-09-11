import {
  parseAgentCheckSelection,
  type AgentCheckSelection,
} from "./build-agent-check";
import {
  parseAgentCheckParticipantReference,
  type AgentCheckParticipantReference,
} from "./agent-check-participant";

export type RequestedSkillSelection = Extract<
  AgentCheckSelection,
  { readonly kind: "skill" }
>;

export interface CheckRequestPresentationV1 {
  readonly actorName: string;
  readonly actorImg?: string;
  readonly requestedCheckLabel: string;
  readonly requestedCheckContext: string;
}

interface CheckRequestStateV1Base {
  readonly schemaVersion: 1;
  readonly participant: AgentCheckParticipantReference;
  readonly selection: RequestedSkillSelection;
  readonly difficulty?: number;
  readonly presentation: CheckRequestPresentationV1;
}

export type CheckRequestStateV1 = CheckRequestStateV1Base & {
  readonly status: "pending" | "resolved";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseParticipant(value: unknown): AgentCheckParticipantReference | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["kind", "uuid"]) ||
    typeof value.kind !== "string" ||
    typeof value.uuid !== "string"
  ) {
    return null;
  }

  try {
    return parseAgentCheckParticipantReference(`${value.kind}|${value.uuid}`);
  } catch {
    return null;
  }
}

function parseSelection(value: unknown): RequestedSkillSelection | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["kind", "key"]) ||
    value.kind !== "skill" ||
    typeof value.key !== "string"
  ) {
    return null;
  }

  try {
    const selection = parseAgentCheckSelection(value.kind, value.key);
    return selection.kind === "skill" ? selection : null;
  } catch {
    return null;
  }
}

function parsePresentation(value: unknown): CheckRequestPresentationV1 | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "actorName",
      "actorImg",
      "requestedCheckLabel",
      "requestedCheckContext",
    ]) ||
    typeof value.actorName !== "string" ||
    value.actorName.trim() === "" ||
    (value.actorImg !== undefined &&
      (typeof value.actorImg !== "string" || value.actorImg.trim() === "")) ||
    typeof value.requestedCheckLabel !== "string" ||
    value.requestedCheckLabel.trim() === "" ||
    typeof value.requestedCheckContext !== "string" ||
    value.requestedCheckContext.trim() === ""
  ) {
    return null;
  }

  return {
    actorName: value.actorName,
    ...(typeof value.actorImg === "string" ? { actorImg: value.actorImg } : {}),
    requestedCheckLabel: value.requestedCheckLabel,
    requestedCheckContext: value.requestedCheckContext,
  };
}

export function parseCheckRequestState(
  value: unknown,
): CheckRequestStateV1 | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "status",
      "participant",
      "selection",
      "difficulty",
      "presentation",
    ]) ||
    value.schemaVersion !== 1 ||
    (value.status !== "pending" && value.status !== "resolved") ||
    (value.difficulty !== undefined &&
      (!Number.isInteger(value.difficulty) || (value.difficulty as number) < 1))
  ) {
    return null;
  }

  const participant = parseParticipant(value.participant);
  const selection = parseSelection(value.selection);
  const presentation = parsePresentation(value.presentation);
  if (!participant || !selection || !presentation) return null;

  return {
    schemaVersion: 1,
    status: value.status,
    participant,
    selection,
    ...(typeof value.difficulty === "number"
      ? { difficulty: value.difficulty }
      : {}),
    presentation,
  };
}
