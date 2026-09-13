import type { AbilityCostData } from "../../core/abilities/ability-cost";

export interface AbilityUseCostClaim {
  readonly abilityId: string;
  readonly useId: string;
  readonly cost: AbilityCostData;
}

export interface AbilityUseCostBalances {
  readonly health: number;
  readonly determination: number;
  readonly abilityResources: Readonly<Record<string, number | null>>;
}

export interface AbilityUseCostPlan {
  readonly claims: readonly AbilityUseCostClaim[];
  readonly health: { readonly amount: number; readonly remaining: number } | null;
  readonly determination: { readonly amount: number; readonly remaining: number } | null;
  readonly abilityResources: Readonly<Record<string, {
    readonly amount: number;
    readonly remaining: number;
  }>>;
}

export type AbilityUseCostPlanResult =
  | { readonly status: "success"; readonly plan: AbilityUseCostPlan }
  | {
      readonly status: "insufficient";
      readonly source: "health" | "determination" | "resource";
      readonly required: number;
      readonly available: number;
      readonly abilityId?: string;
    };

export function resolveAbilityUseCostPlan(
  claims: readonly AbilityUseCostClaim[],
  balances: AbilityUseCostBalances,
): AbilityUseCostPlanResult {
  const healthAmount = claims
    .filter(({ cost }) => cost.source === "health")
    .reduce((sum, { cost }) => sum + cost.amount, 0);
  const determinationAmount = claims
    .filter(({ cost }) => cost.source === "determination")
    .reduce((sum, { cost }) => sum + cost.amount, 0);

  if (healthAmount > balances.health) {
    return {
      status: "insufficient",
      source: "health",
      required: healthAmount,
      available: balances.health,
    };
  }
  if (determinationAmount > balances.determination) {
    return {
      status: "insufficient",
      source: "determination",
      required: determinationAmount,
      available: balances.determination,
    };
  }

  const resourceAmounts = new Map<string, number>();
  for (const claim of claims) {
    if (claim.cost.source !== "resource") continue;
    resourceAmounts.set(
      claim.abilityId,
      (resourceAmounts.get(claim.abilityId) ?? 0) + claim.cost.amount,
    );
  }

  const abilityResources: Record<string, { amount: number; remaining: number }> = {};
  for (const [abilityId, amount] of resourceAmounts) {
    const available = balances.abilityResources[abilityId] ?? 0;
    if (amount > available) {
      return {
        status: "insufficient",
        source: "resource",
        abilityId,
        required: amount,
        available,
      };
    }
    abilityResources[abilityId] = { amount, remaining: available - amount };
  }

  return {
    status: "success",
    plan: {
      claims: claims.map((claim) => ({
        abilityId: claim.abilityId,
        useId: claim.useId,
        cost: { ...claim.cost },
      })),
      health: healthAmount > 0
        ? { amount: healthAmount, remaining: balances.health - healthAmount }
        : null,
      determination: determinationAmount > 0
        ? {
            amount: determinationAmount,
            remaining: balances.determination - determinationAmount,
          }
        : null,
      abilityResources,
    },
  };
}
