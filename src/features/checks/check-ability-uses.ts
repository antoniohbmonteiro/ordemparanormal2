import {
  resolveCheckAbilityUseState,
  type AppliedCheckAbilityUse,
  type CheckAbilityUseReference,
} from "../../application/checks/check-ability-use-state";
import { enqueueActorAbilityCostOperation, payAbilityUseCostPlan } from "../../adapters/foundry/abilities/ability-use-cost-payment";
import { readAgentCheckAbilities } from "../../adapters/foundry/abilities/read-agent-check-abilities";
import type { CheckExtraDieInput, CheckInput } from "../../core/checks/check";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";

export class CheckAbilityUseValidationError extends Error {
  constructor() {
    super("Selected check Ability uses are no longer valid.");
    this.name = "CheckAbilityUseValidationError";
  }
}

export interface PreparedCheckAbilityUses {
  readonly references: readonly CheckAbilityUseReference[];
  readonly applied: readonly AppliedCheckAbilityUse[];
  readonly extraDice: readonly CheckExtraDieInput[];
}

function sameReferences(
  left: readonly CheckAbilityUseReference[],
  right: readonly CheckAbilityUseReference[],
): boolean {
  return left.length === right.length && left.every((reference, index) => {
    const other = right[index];
    return other?.abilityId === reference.abilityId && other.useId === reference.useId;
  });
}

function sameApplied(
  left: readonly AppliedCheckAbilityUse[],
  right: readonly AppliedCheckAbilityUse[],
): boolean {
  return left.length === right.length && left.every((value, index) => {
    const other = right[index];
    return other !== undefined && JSON.stringify(value) === JSON.stringify(other);
  });
}

function resolveSelected(
  actor: foundry.documents.Actor,
  check: CheckInput,
  situationalDice: readonly CheckExtraDieInput[],
  references: readonly CheckAbilityUseReference[],
) {
  const state = resolveCheckAbilityUseState({
    check,
    source: readAgentCheckAbilities(actor),
    situationalDice,
    selected: references,
  });
  if (!sameReferences(state.selected, references)) throw new CheckAbilityUseValidationError();
  return state;
}

export function prepareCheckAbilityUses(
  actor: foundry.documents.Actor,
  check: CheckInput,
  situationalDice: readonly CheckExtraDieInput[],
  references: readonly CheckAbilityUseReference[],
): PreparedCheckAbilityUses {
  const state = resolveSelected(actor, check, situationalDice, references);
  return {
    references: state.selected.map((reference) => ({ ...reference })),
    applied: state.applied.map((value) => ({ ...value, cost: { ...value.cost } })),
    extraDice: state.extraDice.map((value) => ({ ...value })),
  };
}

export function confirmCheckAbilityUses(
  actor: foundry.documents.Actor,
  check: CheckInput,
  situationalDice: readonly CheckExtraDieInput[],
  prepared: PreparedCheckAbilityUses,
): Promise<readonly AppliedCheckAbilityUse[]> {
  if (prepared.references.length === 0) return Promise.resolve([]);
  return enqueueActorAbilityCostOperation(actor, async () => {
    if (!canUserRollActor(actor, game.user)) throw new CheckAbilityUseValidationError();
    const state = resolveSelected(actor, check, situationalDice, prepared.references);
    if (!sameApplied(state.applied, prepared.applied)) throw new CheckAbilityUseValidationError();
    await payAbilityUseCostPlan(actor, state.costPlan);
    return state.applied.map((value) => ({ ...value, cost: { ...value.cost } }));
  });
}
