import type { RadioPiece } from "../../core/equipment/radio-puzzle";
export interface RadioSnapshot {
  readonly schemaVersion: 1;
  readonly equipmentName: string;
  readonly formName: string;
  readonly actorName: string;
  readonly initial: readonly RadioPiece[];
  readonly active: readonly RadioPiece[];
  readonly discarded: readonly RadioPiece[];
  readonly removedCount: number;
  readonly outcome: "success" | "failure" | "cancelled" | "invalidated";
  readonly newCount: number;
}
