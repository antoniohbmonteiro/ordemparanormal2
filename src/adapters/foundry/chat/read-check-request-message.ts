import {
  parseCheckRequestState,
  type CheckRequestStateV1,
} from "../../../application/checks/check-request-state";
import {
  isSupportedCheckSnapshot,
  type CheckSnapshotV3,
} from "../../../application/checks/check-snapshot";
import { resolveCheckDifficulty } from "../../../core/checks/check";
import { CHECK_REQUEST_STATE_FLAG, SYSTEM_ID } from "../../../config/system-config";

export type CheckRequestMessageLifecycle =
  | { readonly state: CheckRequestStateV1 & { readonly status: "pending" } }
  | {
      readonly state: CheckRequestStateV1 & { readonly status: "resolved" };
      readonly snapshot: CheckSnapshotV3;
    };

export function doesSnapshotMatchCheckRequest(
  snapshot: CheckSnapshotV3,
  state: CheckRequestStateV1,
): boolean {
  if (
    snapshot.check.kind !== "skill" ||
    snapshot.check.key !== state.selection.key ||
    snapshot.components.length !== 2 ||
    snapshot.components[0]?.kind !== "attribute" ||
    snapshot.components[1]?.kind !== "skill" ||
    snapshot.components[1].key !== state.selection.key
  ) return false;

  if (state.difficulty === undefined) {
    return snapshot.difficulty === undefined && snapshot.outcome === undefined;
  }
  if (snapshot.difficulty !== state.difficulty || snapshot.outcome === undefined) return false;
  return resolveCheckDifficulty(snapshot.total, state.difficulty).outcome === snapshot.outcome;
}

export function readCheckRequestMessageLifecycle(
  message: ChatMessage,
): CheckRequestMessageLifecycle | null {
  const state = parseCheckRequestState(
    message.getFlag(SYSTEM_ID, CHECK_REQUEST_STATE_FLAG),
  );
  if (!state) return null;
  const rawSnapshot = message.getFlag(SYSTEM_ID, "check");
  if (state.status === "pending") {
    return rawSnapshot === undefined ? { state: { ...state, status: "pending" } } : null;
  }
  if (
    !isSupportedCheckSnapshot(rawSnapshot) ||
    rawSnapshot.schemaVersion !== 3 ||
    !doesSnapshotMatchCheckRequest(rawSnapshot, state)
  ) return null;
  return { state: { ...state, status: "resolved" }, snapshot: rawSnapshot };
}
