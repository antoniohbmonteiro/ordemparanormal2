import type { CheckSnapshot } from "../../application/checks/check-snapshot";
import {
  resolveOpposedCheck,
  type OpposedCheckSideStateV1,
  type OpposedCheckStateV1,
} from "../../application/checks/opposed-check-state";
import { buildCheckCardViewModel, type CheckCardDieViewModel } from "./check-card-view-model";

export type OpposedCheckWinnerSide = "left" | "right";

export interface OpposedCheckParticipantInput {
  readonly name: string;
  readonly img?: string;
  readonly check: CheckSnapshot;
}

export interface OpposedCheckCardInput {
  readonly title: string;
  readonly subtitle: string;
  readonly left: OpposedCheckParticipantInput;
  readonly right: OpposedCheckParticipantInput;
  readonly winner: OpposedCheckWinnerSide;
}

export interface OpposedCheckParticipantViewModel {
  readonly name: string;
  readonly img?: string;
  readonly context: string;
  readonly rolled: boolean;
  readonly total?: number;
  readonly highestResult?: number;
  readonly lowestResult?: number;
  readonly contributingFormula?: string;
  readonly dice?: readonly CheckCardDieViewModel[];
}

export interface ResolvedOpposedCheckParticipantViewModel extends OpposedCheckParticipantViewModel {
  readonly rolled: true;
  readonly total: number;
  readonly highestResult: number;
  readonly lowestResult: number;
  readonly contributingFormula: string;
  readonly dice: readonly CheckCardDieViewModel[];
}

export interface OpposedCheckCardViewModel {
  readonly title: string;
  readonly subtitle: string;
  readonly left: OpposedCheckParticipantViewModel;
  readonly right: OpposedCheckParticipantViewModel;
  readonly resolution: "pending" | "leftWon" | "rightWon" | "equalTotals";
  readonly winner?: OpposedCheckParticipantViewModel;
  readonly hasAnyResult: boolean;
}

function buildResolvedParticipant(
  participant: OpposedCheckParticipantInput,
): ResolvedOpposedCheckParticipantViewModel {
  const check = buildCheckCardViewModel(participant.check);
  return {
    name: participant.name,
    ...(participant.img ? { img: participant.img } : {}),
    context: check.subtitle ?? check.name,
    rolled: true,
    total: check.total,
    highestResult: check.rollAnalysis.highestResult,
    lowestResult: check.rollAnalysis.lowestResult,
    contributingFormula: check.contributingFormula,
    dice: check.dice,
  };
}

function buildStatefulParticipant(side: OpposedCheckSideStateV1): OpposedCheckParticipantViewModel {
  if (!side.result) {
    return {
      name: side.presentation.name,
      ...(side.presentation.img ? { img: side.presentation.img } : {}),
      context: side.presentation.requestedCheckContext,
      rolled: false,
    };
  }
  return buildResolvedParticipant({
    name: side.presentation.name,
    ...(side.presentation.img ? { img: side.presentation.img } : {}),
    check: side.result,
  });
}

export function buildStatefulOpposedCheckCardViewModel(
  state: OpposedCheckStateV1,
  title: string,
  subtitle: string,
): OpposedCheckCardViewModel {
  const left = buildStatefulParticipant(state.left);
  const right = buildStatefulParticipant(state.right);
  const resolution = resolveOpposedCheck(state);
  const winner =
    resolution.status === "leftWon"
      ? left
      : resolution.status === "rightWon"
        ? right
        : undefined;
  return {
    title,
    subtitle,
    left,
    right,
    resolution: resolution.status,
    ...(winner ? { winner } : {}),
    hasAnyResult: left.rolled || right.rolled,
  };
}

export function buildOpposedCheckCardViewModel(input: OpposedCheckCardInput): OpposedCheckCardViewModel & {
  readonly left: ResolvedOpposedCheckParticipantViewModel;
  readonly right: ResolvedOpposedCheckParticipantViewModel;
  readonly winner: ResolvedOpposedCheckParticipantViewModel;
} {
  const left = buildResolvedParticipant(input.left);
  const right = buildResolvedParticipant(input.right);
  return {
    title: input.title,
    subtitle: input.subtitle,
    left,
    right,
    resolution: input.winner === "left" ? "leftWon" : "rightWon",
    winner: input.winner === "left" ? left : right,
    hasAnyResult: true,
  };
}
