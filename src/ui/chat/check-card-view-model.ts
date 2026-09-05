import type {
  CheckSnapshot,
  CheckSnapshotV2,
  CheckSnapshotV3,
} from "../../application/checks/check-snapshot";
import { SYSTEM_ID } from "../../config/system-config";
import {
  getContributingResultIndexes,
  type CheckOutcome,
} from "../../core/checks/check";
import { analyzeCheckRoll } from "../../core/checks/check-roll-analysis";
import {
  resolveAptitudeSpecializationIconPath,
  resolveSkillIconPath,
} from "../icons/skill-icons";

const ATTRIBUTE_ICON_CLASSES: Readonly<Record<string, string>> = {
  physical: "fa-solid fa-hand-fist",
  mind: "fa-solid fa-brain",
  emotion: "fa-solid fa-heart",
};
const FALLBACK_COMPONENT_ICON_CLASS = "fa-solid fa-dice-d20";

export interface CheckCardDieViewModel {
  readonly label: string;
  readonly dieLabel: string;
  readonly result: number;
  readonly contributes: boolean;
  readonly iconPath?: string;
  readonly iconClass?: string;
}

export interface CheckCardViewModel {
  readonly name: string;
  readonly subtitle?: string;
  readonly dice: readonly CheckCardDieViewModel[];
  readonly contributingFormula: string;
  readonly total: number;
  readonly resolution?: {
    readonly difficulty: number;
    readonly outcome: CheckOutcome;
    readonly isSuccess: boolean;
  };
  readonly rollAnalysis: {
    readonly highestResult: number;
    readonly lowestResult: number;
    readonly isPositiveCritical: boolean;
    readonly isCriticalFailure: boolean;
  };
}

function hasDifficultyResolution(
  snapshot: CheckSnapshot,
): snapshot is (CheckSnapshotV2 | CheckSnapshotV3) & {
  readonly difficulty: number;
  readonly outcome: CheckOutcome;
} {
  return (
    (snapshot.schemaVersion === 2 || snapshot.schemaVersion === 3) &&
    typeof snapshot.difficulty === "number" &&
    (snapshot.outcome === "success" || snapshot.outcome === "failure")
  );
}

function getExtraDice(snapshot: CheckSnapshot) {
  return snapshot.schemaVersion === 3 ? snapshot.extraDice : [];
}

function getComponentIcon(component: CheckSnapshot["components"][number]): {
  readonly iconPath?: string;
  readonly iconClass?: string;
} {
  if (component.kind === "attribute") {
    return {
      iconClass:
        ATTRIBUTE_ICON_CLASSES[component.key] ?? FALLBACK_COMPONENT_ICON_CLASS,
    };
  }

  const iconPath =
    component.kind === "specialization"
      ? resolveAptitudeSpecializationIconPath(component.key)
      : resolveSkillIconPath(component.key);

  return iconPath
    ? { iconPath }
    : { iconClass: FALLBACK_COMPONENT_ICON_CLASS };
}

export function buildCheckCardViewModel(
  snapshot: CheckSnapshot,
): CheckCardViewModel {
  const extraDice = getExtraDice(snapshot);
  const rolledDice: readonly {
    readonly label: string;
    readonly die: number;
    readonly result: number;
    readonly iconPath?: string;
    readonly iconClass?: string;
  }[] = [
    ...snapshot.components.map((component) => ({
      label: component.label,
      die: component.die,
      result: component.result,
      ...getComponentIcon(component),
    })),
    ...extraDice.map((extraDie) => ({
      label: extraDie.label,
      die: extraDie.die,
      result: extraDie.result,
      iconPath: `systems/${SYSTEM_ID}/assets/icons/dice/d${extraDie.die}.svg`,
    })),
  ];
  const results = rolledDice.map(({ result }) => result);
  const contributingIndexes = getContributingResultIndexes(results);
  const contributingIndexSet = new Set(contributingIndexes);
  const rollAnalysis = analyzeCheckRoll(results);
  const subtitle =
    snapshot.check.kind === "attribute" || snapshot.components.length < 2
      ? undefined
      : snapshot.components.map(({ label }) => label).join(" + ");

  return {
    name: snapshot.check.name,
    ...(subtitle ? { subtitle } : {}),
    dice: rolledDice.map((die, index) => ({
      label: die.label,
      dieLabel: `d${die.die}`,
      result: die.result,
      contributes: contributingIndexSet.has(index),
      ...(die.iconPath ? { iconPath: die.iconPath } : {}),
      ...(die.iconClass ? { iconClass: die.iconClass } : {}),
    })),
    contributingFormula: contributingIndexes
      .map((index) => `d${rolledDice[index]?.die}`)
      .join(" + "),
    total: snapshot.total,
    ...(hasDifficultyResolution(snapshot)
      ? {
          resolution: {
            difficulty: snapshot.difficulty,
            outcome: snapshot.outcome,
            isSuccess: snapshot.outcome === "success",
          },
        }
      : {}),
    rollAnalysis: {
      highestResult: rollAnalysis.highestResult,
      lowestResult: rollAnalysis.lowestResult,
      isPositiveCritical: rollAnalysis.critical === "positive",
      isCriticalFailure: rollAnalysis.critical === "failure",
    },
  };
}
