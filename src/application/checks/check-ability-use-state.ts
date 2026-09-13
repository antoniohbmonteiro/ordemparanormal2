import type { AbilityCostData } from "../../core/abilities/ability-cost";
import type { AbilityResourceData } from "../../core/abilities/ability-resource";
import type { AbilityUseData } from "../../core/abilities/ability-use";
import type { CheckExtraDieInput, CheckInput } from "../../core/checks/check";
import { MAX_CHECK_DICE } from "../../core/checks/check";
import type { NormalDieStep } from "../../core/dice/die-step";
import {
  resolveAbilityUseCostPlan,
  type AbilityUseCostPlan,
  type AbilityUseCostPlanResult,
} from "../abilities/ability-use-cost-plan";

export interface CheckAbilityUseReference {
  readonly abilityId: string;
  readonly useId: string;
}

export interface AgentCheckAbility {
  readonly id: string;
  readonly name: string;
  readonly resource: AbilityResourceData | null;
  readonly uses: readonly AbilityUseData[];
}

export interface AgentCheckAbilitySource {
  readonly level: number;
  readonly health: number;
  readonly determination: number;
  readonly abilities: readonly AgentCheckAbility[];
}

export type CheckAbilityUseUnavailableReason =
  | "minimumLevel"
  | "diceLimit"
  | "insufficientHealth"
  | "insufficientDetermination"
  | "insufficientResource";

export interface CheckAbilityUseOption extends CheckAbilityUseReference {
  readonly abilityName: string;
  readonly useName: string;
  readonly die: NormalDieStep;
  readonly cost: AbilityCostData;
  readonly selected: boolean;
  readonly available: boolean;
  readonly unavailableReason?: CheckAbilityUseUnavailableReason;
}

export interface AppliedCheckAbilityUse extends CheckAbilityUseReference {
  readonly abilityName: string;
  readonly useName: string;
  readonly extraDieId: string;
  readonly die: NormalDieStep;
  readonly cost: AbilityCostData;
}

export interface CheckAbilityUseState {
  readonly options: readonly CheckAbilityUseOption[];
  readonly selected: readonly CheckAbilityUseReference[];
  readonly applied: readonly AppliedCheckAbilityUse[];
  readonly extraDice: readonly CheckExtraDieInput[];
  readonly costPlan: AbilityUseCostPlan;
  readonly totalDice: number;
}

export interface ResolveCheckAbilityUseStateInput {
  readonly check: CheckInput;
  readonly source: AgentCheckAbilitySource;
  readonly situationalDice: readonly CheckExtraDieInput[];
  readonly selected: readonly CheckAbilityUseReference[];
}

function effectiveAttribute(input: CheckInput): string | null {
  return input.components.find(({ kind }) => kind === "attribute")?.key ?? null;
}

function isApplicable(input: CheckInput, use: AbilityUseData): boolean {
  const applicability = use.checkIntegration?.modification.applicability;
  if (!applicability) return false;
  if (applicability.type === "any") return true;
  if (applicability.type === "attribute") {
    return effectiveAttribute(input) === applicability.attribute;
  }
  return input.check.kind === "skill" && input.check.key === applicability.skill;
}

function extraDieId(reference: CheckAbilityUseReference): string {
  return `ability:${reference.abilityId}:${reference.useId}`;
}

function costResult(
  source: AgentCheckAbilitySource,
  selected: readonly { readonly ability: AgentCheckAbility; readonly use: AbilityUseData }[],
): AbilityUseCostPlanResult {
  return resolveAbilityUseCostPlan(
    selected.map(({ ability, use }) => ({
      abilityId: ability.id,
      useId: use.id,
      cost: use.cost,
    })),
    {
      health: source.health,
      determination: source.determination,
      abilityResources: Object.fromEntries(
        source.abilities.map(({ id, resource }) => [id, resource?.value ?? null]),
      ),
    },
  );
}

function reasonFromCost(result: Extract<AbilityUseCostPlanResult, { status: "insufficient" }>): CheckAbilityUseUnavailableReason {
  if (result.source === "health") return "insufficientHealth";
  if (result.source === "determination") return "insufficientDetermination";
  return "insufficientResource";
}

function resolveReference(
  source: AgentCheckAbilitySource,
  reference: CheckAbilityUseReference,
): { readonly ability: AgentCheckAbility; readonly use: AbilityUseData } | null {
  const ability = source.abilities.find(({ id }) => id === reference.abilityId);
  const use = ability?.uses.find(({ id }) => id === reference.useId);
  return ability && use ? { ability, use } : null;
}

export function resolveCheckAbilityUseState(
  input: ResolveCheckAbilityUseStateInput,
): CheckAbilityUseState {
  const applicable = input.source.abilities.flatMap((ability) =>
    ability.uses
      .filter((use) => isApplicable(input.check, use))
      .map((use) => ({ ability, use })),
  );
  const applicableKeys = new Set(applicable.map(({ ability, use }) => `${ability.id}\0${use.id}`));
  const onePerAbility = new Map<string, CheckAbilityUseReference>();
  for (const reference of input.selected) {
    if (!applicableKeys.has(`${reference.abilityId}\0${reference.useId}`)) continue;
    onePerAbility.set(reference.abilityId, { ...reference });
  }

  const selectedPairs: { ability: AgentCheckAbility; use: AbilityUseData }[] = [];
  for (const reference of onePerAbility.values()) {
    const pair = resolveReference(input.source, reference);
    if (!pair || pair.use.minimumLevel !== null && input.source.level < pair.use.minimumLevel) continue;
    const hypothetical = [...selectedPairs, pair];
    if (input.check.components.length + input.situationalDice.length + hypothetical.length > MAX_CHECK_DICE) continue;
    if (costResult(input.source, hypothetical).status !== "success") continue;
    selectedPairs.push(pair);
  }

  const selected = selectedPairs.map(({ ability, use }) => ({ abilityId: ability.id, useId: use.id }));
  const options = applicable.map(({ ability, use }): CheckAbilityUseOption => {
    const isSelected = selected.some(({ abilityId, useId }) => abilityId === ability.id && useId === use.id);
    const hypothetical = [
      ...selectedPairs.filter((pair) => pair.ability.id !== ability.id),
      { ability, use },
    ];
    let unavailableReason: CheckAbilityUseUnavailableReason | undefined;
    if (use.minimumLevel !== null && input.source.level < use.minimumLevel) {
      unavailableReason = "minimumLevel";
    } else if (input.check.components.length + input.situationalDice.length + hypothetical.length > MAX_CHECK_DICE) {
      unavailableReason = "diceLimit";
    } else {
      const result = costResult(input.source, hypothetical);
      if (result.status === "insufficient") unavailableReason = reasonFromCost(result);
    }
    return {
      abilityId: ability.id,
      useId: use.id,
      abilityName: ability.name,
      useName: use.name,
      die: use.checkIntegration!.modification.die,
      cost: { ...use.cost },
      selected: isSelected,
      available: unavailableReason === undefined,
      ...(unavailableReason ? { unavailableReason } : {}),
    };
  });
  const planResult = costResult(input.source, selectedPairs);
  if (planResult.status !== "success") throw new Error("Reconciled Ability uses must have an affordable cost plan.");
  const applied = selectedPairs.map(({ ability, use }): AppliedCheckAbilityUse => ({
    abilityId: ability.id,
    abilityName: ability.name,
    useId: use.id,
    useName: use.name,
    extraDieId: extraDieId({ abilityId: ability.id, useId: use.id }),
    die: use.checkIntegration!.modification.die,
    cost: { ...use.cost },
  }));
  return {
    options,
    selected,
    applied,
    extraDice: applied.map(({ extraDieId: id, die, abilityName, useName }) => ({
      id,
      die,
      source: "ability",
      label: `${abilityName} — ${useName}`,
    })),
    costPlan: planResult.plan,
    totalDice: input.check.components.length + input.situationalDice.length + selected.length,
  };
}

export function toggleCheckAbilityUse(
  input: ResolveCheckAbilityUseStateInput,
  reference: CheckAbilityUseReference,
): CheckAbilityUseState {
  const current = input.selected.some(({ abilityId, useId }) =>
    abilityId === reference.abilityId && useId === reference.useId,
  );
  const selected = current
    ? input.selected.filter(({ abilityId, useId }) => abilityId !== reference.abilityId || useId !== reference.useId)
    : [...input.selected.filter(({ abilityId }) => abilityId !== reference.abilityId), reference];
  return resolveCheckAbilityUseState({ ...input, selected });
}
