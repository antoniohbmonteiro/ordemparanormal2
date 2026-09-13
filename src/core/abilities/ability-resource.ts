import {
  FREE_ABILITY_COST,
} from "./ability-cost";
import type { AbilityUseData } from "./ability-use";

export interface AbilityResourceData {
  readonly value: number;
  readonly max: number;
}

export const EMPTY_ABILITY_RESOURCE: AbilityResourceData = {
  value: 0,
  max: 0,
};

export interface AbilityResourceRemoval {
  readonly confirmationRequired: boolean;
  readonly uses: readonly AbilityUseData[];
}

export type AbilityResourceAdjustment = -1 | 1;

export function adjustAbilityResourceValue(
  resource: AbilityResourceData,
  adjustment: AbilityResourceAdjustment,
): AbilityResourceData {
  if (adjustment < 0) {
    return { ...resource, value: Math.max(0, resource.value - 1) };
  }
  if (resource.value >= resource.max) return resource;
  return { ...resource, value: resource.value + 1 };
}

export function prepareAbilityResourceRemoval(
  uses: readonly AbilityUseData[],
  resource: AbilityResourceData,
): AbilityResourceRemoval {
  const referenced = uses.some(({ cost }) => cost.source === "resource");
  return {
    confirmationRequired: referenced || resource.value > 0 || resource.max > 0,
    uses: uses.map((use) =>
      use.cost.source === "resource"
        ? { ...use, cost: FREE_ABILITY_COST }
        : use,
    ),
  };
}

export function readAbilityResource(value: unknown): AbilityResourceData | null {
  if (!value || typeof value !== "object") return null;

  const resource = value as Partial<AbilityResourceData>;
  return Number.isInteger(resource.value) &&
    Number(resource.value) >= 0 &&
    Number.isInteger(resource.max) &&
    Number(resource.max) >= 0
    ? { value: Number(resource.value), max: Number(resource.max) }
    : null;
}
