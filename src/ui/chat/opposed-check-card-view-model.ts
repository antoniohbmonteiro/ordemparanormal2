import type { CheckSnapshot } from "../../application/checks/check-snapshot";
import {
  buildCheckCardViewModel,
  type CheckCardDieViewModel,
} from "./check-card-view-model";

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
  readonly winner: OpposedCheckParticipantViewModel;
}

function buildParticipantViewModel(
  participant: OpposedCheckParticipantInput,
): OpposedCheckParticipantViewModel {
  const check = buildCheckCardViewModel(participant.check);

  return {
    name: participant.name,
    ...(participant.img ? { img: participant.img } : {}),
    context: check.subtitle ?? check.name,
    total: check.total,
    highestResult: check.rollAnalysis.highestResult,
    lowestResult: check.rollAnalysis.lowestResult,
    contributingFormula: check.contributingFormula,
    dice: check.dice,
  };
}

export function buildOpposedCheckCardViewModel(
  input: OpposedCheckCardInput,
): OpposedCheckCardViewModel {
  const left = buildParticipantViewModel(input.left);
  const right = buildParticipantViewModel(input.right);

  return {
    title: input.title,
    subtitle: input.subtitle,
    left,
    right,
    winner: input.winner === "left" ? left : right,
  };
}
