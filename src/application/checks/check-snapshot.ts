import type {
  CheckComponentKind,
  CheckDifficultyResolution,
  CheckKind,
  CheckOutcome,
  CheckResult,
} from "../../core/checks/check";
import type { DieStep } from "../../core/dice/die-step";

interface LegacyCheckSnapshotComponent {
  readonly kind: CheckComponentKind;
  readonly key: string;
  readonly label: string;
  readonly die: DieStep;
  readonly result: number;
}

interface LegacyCheckSnapshotResult {
  readonly check: {
    readonly kind: CheckKind;
    readonly key: string;
    readonly name: string;
  };
  readonly components: readonly LegacyCheckSnapshotComponent[];
  readonly total: number;
}

export interface CheckSnapshotV1 extends LegacyCheckSnapshotResult {
  readonly schemaVersion: 1;
}

interface CheckSnapshotV2Base extends LegacyCheckSnapshotResult {
  readonly schemaVersion: 2;
}

export type CheckSnapshotV2 =
  | (CheckSnapshotV2Base & {
      readonly difficulty?: undefined;
      readonly outcome?: undefined;
    })
  | (CheckSnapshotV2Base & {
      readonly difficulty: number;
      readonly outcome: CheckOutcome;
    });

interface CheckSnapshotV3Base extends CheckResult {
  readonly schemaVersion: 3;
}

export type CheckSnapshotV3 =
  | (CheckSnapshotV3Base & {
      readonly difficulty?: undefined;
      readonly outcome?: undefined;
    })
  | (CheckSnapshotV3Base & {
      readonly difficulty: number;
      readonly outcome: CheckOutcome;
    });

export type CheckSnapshot =
  | CheckSnapshotV1
  | CheckSnapshotV2
  | CheckSnapshotV3;

export function createCheckSnapshot(
  result: CheckResult,
  resolution?: CheckDifficultyResolution,
): CheckSnapshotV3 {
  const snapshot: CheckSnapshotV3Base = {
    schemaVersion: 3,
    check: { ...result.check },
    components: result.components.map((component) => ({ ...component })),
    extraDice: result.extraDice.map((extraDie) => ({ ...extraDie })),
    total: result.total,
  };

  if (!resolution) return snapshot;

  return {
    ...snapshot,
    difficulty: resolution.difficulty,
    outcome: resolution.outcome,
  };
}
