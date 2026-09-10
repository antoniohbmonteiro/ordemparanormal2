import { parseAgentCheckSelection, type AgentCheckSelection } from "./build-agent-check";
import { isSupportedCheckSnapshot, type CheckSnapshotV3 } from "./check-snapshot";
import {
  areOpposedCheckParticipantReferencesEqual,
  parseOpposedCheckParticipantReference,
  type OpposedCheckParticipantReference,
} from "./opposed-check-configuration";

export type OpposedCheckSide = "left" | "right";

export interface OpposedCheckParticipantPresentationV1 {
  readonly name: string;
  readonly img?: string;
  readonly requestedCheckLabel: string;
  readonly requestedCheckContext: string;
}

export interface OpposedCheckSideStateV1 {
  readonly participant: OpposedCheckParticipantReference;
  readonly selection: AgentCheckSelection;
  readonly presentation: OpposedCheckParticipantPresentationV1;
  readonly result?: CheckSnapshotV3;
}

export interface OpposedCheckStateV1 {
  readonly schemaVersion: 1;
  readonly left: OpposedCheckSideStateV1;
  readonly right: OpposedCheckSideStateV1;
}

export type OpposedCheckResolution =
  | { readonly status: "pending" }
  | { readonly status: "leftWon"; readonly winner: "left" }
  | { readonly status: "rightWon"; readonly winner: "right" }
  | { readonly status: "equalTotals" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSelection(value: unknown): AgentCheckSelection | null {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.key !== "string") return null;
  try {
    return parseAgentCheckSelection(value.kind, value.key);
  } catch {
    return null;
  }
}

function parseReference(value: unknown): OpposedCheckParticipantReference | null {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.uuid !== "string") return null;
  try {
    return parseOpposedCheckParticipantReference(`${value.kind}|${value.uuid}`);
  } catch {
    return null;
  }
}

function parsePresentation(value: unknown): OpposedCheckParticipantPresentationV1 | null {
  if (!isRecord(value)) return null;
  const { name, img, requestedCheckLabel, requestedCheckContext } = value;
  if (
    typeof name !== "string" ||
    name.trim() === "" ||
    (img !== undefined && (typeof img !== "string" || img.trim() === "")) ||
    typeof requestedCheckLabel !== "string" ||
    requestedCheckLabel.trim() === "" ||
    typeof requestedCheckContext !== "string" ||
    requestedCheckContext.trim() === ""
  ) {
    return null;
  }
  return {
    name,
    ...(typeof img === "string" ? { img } : {}),
    requestedCheckLabel,
    requestedCheckContext,
  };
}

export function doesSnapshotMatchSelection(
  snapshot: CheckSnapshotV3,
  selection: AgentCheckSelection,
): boolean {
  if (snapshot.difficulty !== undefined || snapshot.outcome !== undefined) return false;
  if (snapshot.check.kind !== selection.kind || snapshot.check.key !== selection.key) return false;
  if (selection.kind === "attribute") {
    return (
      snapshot.components.length === 1 &&
      snapshot.components[0]?.kind === "attribute" &&
      snapshot.components[0].key === selection.key
    );
  }
  if (snapshot.components.length !== 2 || snapshot.components[0]?.kind !== "attribute") return false;
  const requested = snapshot.components[1];
  return selection.kind === "skill"
    ? requested?.kind === "skill" && requested.key === selection.key
    : requested?.kind === "specialization" && requested.key === selection.key;
}

function parseSide(value: unknown): OpposedCheckSideStateV1 | null {
  if (!isRecord(value)) return null;
  const participant = parseReference(value.participant);
  const selection = parseSelection(value.selection);
  const presentation = parsePresentation(value.presentation);
  if (!participant || !selection || !presentation) return null;
  if (value.result === undefined) return { participant, selection, presentation };
  if (
    !isSupportedCheckSnapshot(value.result) ||
    value.result.schemaVersion !== 3 ||
    !doesSnapshotMatchSelection(value.result, selection)
  ) {
    return null;
  }
  return { participant, selection, presentation, result: value.result };
}

export function parseOpposedCheckState(value: unknown): OpposedCheckStateV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const left = parseSide(value.left);
  const right = parseSide(value.right);
  if (
    !left ||
    !right ||
    areOpposedCheckParticipantReferencesEqual(left.participant, right.participant)
  ) {
    return null;
  }
  return { schemaVersion: 1, left, right };
}

export function resolveOpposedCheck(state: OpposedCheckStateV1): OpposedCheckResolution {
  const left = state.left.result;
  const right = state.right.result;
  if (!left || !right) return { status: "pending" };
  if (left.total > right.total) return { status: "leftWon", winner: "left" };
  if (right.total > left.total) return { status: "rightWon", winner: "right" };
  return { status: "equalTotals" };
}

export function areRequestedChecksEqual(state: OpposedCheckStateV1): boolean {
  return (
    state.left.selection.kind === state.right.selection.kind &&
    state.left.selection.key === state.right.selection.key
  );
}
