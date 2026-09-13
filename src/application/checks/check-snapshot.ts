import type {
  CheckComponentKind,
  CheckDifficultyResolution,
  CheckKind,
  CheckOutcome,
  CheckResult,
  ResolvedCheckExtraDie,
} from "../../core/checks/check";
import type { DieStep } from "../../core/dice/die-step";
import { calculateCheckTotal } from "../../core/checks/check";
import { isDieStep, NORMAL_DIE_STEPS } from "../../core/dice/die-step";
import { readAbilityCost } from "../../core/abilities/ability-cost";
import type { AppliedCheckAbilityUse } from "./check-ability-use-state";

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

interface CheckSnapshotV3ExtraDie extends Omit<ResolvedCheckExtraDie, "source"> {
  readonly source: "situational";
}

interface CheckSnapshotV3Base extends Omit<CheckResult, "extraDice"> {
  readonly schemaVersion: 3;
  readonly extraDice: readonly CheckSnapshotV3ExtraDie[];
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

interface CheckSnapshotV4Base extends CheckResult {
  readonly schemaVersion: 4;
  readonly appliedAbilityUses: readonly AppliedCheckAbilityUse[];
}

export type CheckSnapshotV4 =
  | (CheckSnapshotV4Base & {
      readonly difficulty?: undefined;
      readonly outcome?: undefined;
    })
  | (CheckSnapshotV4Base & {
      readonly difficulty: number;
      readonly outcome: CheckOutcome;
    });

export type ModernCheckSnapshot = CheckSnapshotV3 | CheckSnapshotV4;

export type CheckSnapshot =
  | CheckSnapshotV1
  | CheckSnapshotV2
  | CheckSnapshotV3
  | CheckSnapshotV4;

export function createCheckSnapshot(
  result: CheckResult,
  resolution?: CheckDifficultyResolution,
  appliedAbilityUses: readonly AppliedCheckAbilityUse[] = [],
): CheckSnapshotV4 {
  const snapshot: CheckSnapshotV4Base = {
    schemaVersion: 4,
    check: { ...result.check },
    components: result.components.map((component) => ({ ...component })),
    extraDice: result.extraDice.map((extraDie) => ({ ...extraDie })),
    appliedAbilityUses: appliedAbilityUses.map((use) => ({
      ...use,
      cost: { ...use.cost },
    })),
    total: result.total,
  };

  const complete: CheckSnapshotV4 = !resolution ? snapshot : {
    ...snapshot,
    difficulty: resolution.difficulty,
    outcome: resolution.outcome,
  };
  if (!isSupportedCheckSnapshot(complete)) throw new Error("Cannot create an inconsistent Check Snapshot V4.");
  return complete;
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

function isSnapshotExtraDie(value: unknown, allowAbility: boolean): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.trim() !== "" &&
    typeof value.label === "string" &&
    value.label.trim() !== "" &&
    (value.source === "situational" || allowAbility && value.source === "ability") &&
    NORMAL_DIE_STEPS.includes(value.die as (typeof NORMAL_DIE_STEPS)[number]) &&
    Number.isInteger(value.result) &&
    (value.result as number) >= 1 &&
    (value.result as number) <= (value.die as number)
  );
}

function isAppliedAbilityUse(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.abilityId === "string" && value.abilityId.trim() !== "" &&
    typeof value.abilityName === "string" && value.abilityName.trim() !== "" &&
    typeof value.useId === "string" && value.useId.trim() !== "" &&
    typeof value.useName === "string" && value.useName.trim() !== "" &&
    typeof value.extraDieId === "string" &&
    value.extraDieId === `ability:${String(value.abilityId)}:${String(value.useId)}` &&
    NORMAL_DIE_STEPS.includes(value.die as (typeof NORMAL_DIE_STEPS)[number]) &&
    readAbilityCost(value.cost) !== null
  );
}

export function isSupportedCheckSnapshot(value: unknown): value is CheckSnapshot {
  if (!isRecord(value) || !isRecord(value.check)) return false;
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== 4) return false;
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

  const extraDice = value.schemaVersion === 3 || value.schemaVersion === 4 ? value.extraDice : [];
  if (!Array.isArray(extraDice) || !extraDice.every((die) => isSnapshotExtraDie(die, value.schemaVersion === 4))) return false;
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
  if ((value.schemaVersion === 3 || value.schemaVersion === 4) && value.total !== calculateCheckTotal(results)) return false;

  if (value.schemaVersion === 4) {
    if (!Array.isArray(value.appliedAbilityUses) || !value.appliedAbilityUses.every(isAppliedAbilityUse)) return false;
    const uses = value.appliedAbilityUses as readonly Record<string, unknown>[];
    const abilityExtraDice = extraDice.filter((die) => (die as Record<string, unknown>).source === "ability");
    if (uses.length !== abilityExtraDice.length) return false;
    const useKeys = uses.map((use) => `${String(use.abilityId)}\0${String(use.useId)}`);
    const abilityIds = uses.map((use) => String(use.abilityId));
    const useExtraIds = uses.map((use) => String(use.extraDieId));
    if (
      new Set(useKeys).size !== useKeys.length ||
      new Set(abilityIds).size !== abilityIds.length ||
      new Set(useExtraIds).size !== useExtraIds.length
    ) return false;
    for (const use of uses) {
      const die = abilityExtraDice.find((extra) => (extra as Record<string, unknown>).id === use.extraDieId) as Record<string, unknown> | undefined;
      if (!die || die.die !== use.die) return false;
    }
  }

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
