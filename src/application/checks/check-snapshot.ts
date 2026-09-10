import type {
  CheckComponentKind,
  CheckDifficultyResolution,
  CheckKind,
  CheckOutcome,
  CheckResult,
} from "../../core/checks/check";
import type { DieStep } from "../../core/dice/die-step";
import { calculateCheckTotal } from "../../core/checks/check";
import { isDieStep, NORMAL_DIE_STEPS } from "../../core/dice/die-step";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSnapshotComponent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.kind === "attribute" || value.kind === "skill" || value.kind === "specialization") &&
    typeof value.key === "string" &&
    value.key.trim() !== "" &&
    typeof value.label === "string" &&
    value.label.trim() !== "" &&
    isDieStep(value.die) &&
    Number.isInteger(value.result) &&
    (value.result as number) >= 1 &&
    (value.result as number) <= value.die
  );
}

function isSnapshotExtraDie(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.trim() !== "" &&
    typeof value.label === "string" &&
    value.label.trim() !== "" &&
    value.source === "situational" &&
    NORMAL_DIE_STEPS.includes(value.die as (typeof NORMAL_DIE_STEPS)[number]) &&
    Number.isInteger(value.result) &&
    (value.result as number) >= 1 &&
    (value.result as number) <= (value.die as number)
  );
}

export function isSupportedCheckSnapshot(value: unknown): value is CheckSnapshot {
  if (!isRecord(value) || !isRecord(value.check)) return false;
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3) return false;
  if (
    (value.check.kind !== "attribute" && value.check.kind !== "skill" && value.check.kind !== "aptitude") ||
    typeof value.check.key !== "string" ||
    value.check.key.trim() === "" ||
    typeof value.check.name !== "string" ||
    value.check.name.trim() === ""
  ) {
    return false;
  }
  if (
    !Array.isArray(value.components) ||
    value.components.length === 0 ||
    !value.components.every(isSnapshotComponent)
  ) {
    return false;
  }

  const extraDice = value.schemaVersion === 3 ? value.extraDice : [];
  if (!Array.isArray(extraDice) || !extraDice.every(isSnapshotExtraDie)) return false;
  if (value.components.length + extraDice.length > 4) return false;
  const componentKeys = value.components.map((component) => (component as Record<string, unknown>).key);
  const extraIds = extraDice.map((die) => (die as Record<string, unknown>).id);
  if (
    new Set(componentKeys).size !== componentKeys.length ||
    new Set(extraIds).size !== extraIds.length
  ) {
    return false;
  }

  const results = [
    ...value.components.map((component) => (component as Record<string, unknown>).result as number),
    ...extraDice.map((die) => (die as Record<string, unknown>).result as number),
  ];
  if (typeof value.total !== "number" || !Number.isFinite(value.total)) return false;
  if (value.schemaVersion === 3 && value.total !== calculateCheckTotal(results)) return false;

  if (value.schemaVersion === 1) {
    return value.difficulty === undefined && value.outcome === undefined;
  }
  if (value.difficulty === undefined && value.outcome === undefined) return true;
  return (
    Number.isInteger(value.difficulty) &&
    (value.difficulty as number) >= 1 &&
    (value.outcome === "success" || value.outcome === "failure")
  );
}
