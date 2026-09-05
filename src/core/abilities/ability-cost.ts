export const ABILITY_COST_SOURCES = [
  "none",
  "determination",
  "resource",
] as const;

export type AbilityCostSource = (typeof ABILITY_COST_SOURCES)[number];

export interface AbilityCostData {
  readonly source: AbilityCostSource;
  readonly amount: number;
}

export const FREE_ABILITY_COST: AbilityCostData = {
  source: "none",
  amount: 0,
};

function isCostSource(value: unknown): value is AbilityCostSource {
  return ABILITY_COST_SOURCES.some((source) => source === value);
}

export function readAbilityCost(value: unknown): AbilityCostData | null {
  if (!value || typeof value !== "object") return null;

  const cost = value as Partial<AbilityCostData>;
  if (!isCostSource(cost.source)) return null;
  if (typeof cost.amount !== "number" || !Number.isInteger(cost.amount) || cost.amount < 0) {
    return null;
  }

  if (cost.source === "none") {
    return cost.amount === 0 ? FREE_ABILITY_COST : null;
  }

  return { source: cost.source, amount: cost.amount };
}

export function normalizeAbilityCost(
  source: AbilityCostSource,
  amount: number,
): AbilityCostData {
  const safeAmount = Number.isInteger(amount) && amount >= 0 ? amount : 0;

  if (source === "none") return FREE_ABILITY_COST;
  return { source, amount: safeAmount };
}
