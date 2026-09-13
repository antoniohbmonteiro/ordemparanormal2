import {
  readAbilityCost,
  type AbilityCostData,
} from "./ability-cost";

export interface AbilityUseData {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cost: AbilityCostData;
  readonly minimumLevel: number | null;
}

export type AbilityUsePatch = Partial<{
  name: string;
  description: string;
  cost: AbilityCostData;
  minimumLevel: number | null;
}>;

export type AbilityUseMoveDirection = "up" | "down";

export function readAbilityUse(value: unknown): AbilityUseData | null {
  if (!value || typeof value !== "object") return null;
  const use = value as Partial<AbilityUseData>;
  const id = typeof use.id === "string" ? use.id.trim() : "";
  const name = typeof use.name === "string" ? use.name.trim() : "";
  const description = typeof use.description === "string" ? use.description : null;
  const cost = readAbilityCost(use.cost);
  const minimumLevel = use.minimumLevel;

  if (!id || !name || description === null || !cost) return null;
  if (
    minimumLevel !== null &&
    (!Number.isInteger(minimumLevel) || Number(minimumLevel) < 1 || Number(minimumLevel) > 10)
  ) {
    return null;
  }

  return {
    id,
    name,
    description,
    cost,
    minimumLevel: minimumLevel === null ? null : Number(minimumLevel),
  };
}

export function readAbilityUses(value: unknown): readonly AbilityUseData[] | null {
  if (!Array.isArray(value)) return null;
  const uses = value.map(readAbilityUse);
  if (uses.some((use) => use === null)) return null;
  const valid = uses as AbilityUseData[];
  if (new Set(valid.map(({ id }) => id)).size !== valid.length) return null;
  return valid;
}

export function resolveAbilityUse(
  uses: readonly AbilityUseData[],
  id: string,
): AbilityUseData | null {
  return uses.find((use) => use.id === id) ?? null;
}

export function appendAbilityUse(
  uses: readonly AbilityUseData[],
  use: AbilityUseData,
): readonly AbilityUseData[] | null {
  if (resolveAbilityUse(uses, use.id)) return null;
  return [...uses, use];
}

export function patchAbilityUse(
  uses: readonly AbilityUseData[],
  id: string,
  patch: AbilityUsePatch,
): readonly AbilityUseData[] | null {
  const index = uses.findIndex((use) => use.id === id);
  if (index < 0) return null;
  const candidate = readAbilityUse({ ...uses[index], ...patch });
  if (!candidate || candidate.id !== id) return null;
  const next = [...uses];
  next[index] = candidate;
  return next;
}

export function removeAbilityUse(
  uses: readonly AbilityUseData[],
  id: string,
): readonly AbilityUseData[] | null {
  const index = uses.findIndex((use) => use.id === id);
  if (index < 0) return null;
  return [...uses.slice(0, index), ...uses.slice(index + 1)];
}

export function reorderAbilityUse(
  uses: readonly AbilityUseData[],
  id: string,
  direction: AbilityUseMoveDirection,
): readonly AbilityUseData[] | null {
  const index = uses.findIndex((use) => use.id === id);
  if (index < 0) return null;
  const neighbor = direction === "up" ? index - 1 : index + 1;
  if (neighbor < 0 || neighbor >= uses.length) return uses;
  const next = [...uses];
  [next[index], next[neighbor]] = [next[neighbor]!, next[index]!];
  return next;
}

export function createAbilityUsePatch(
  baseline: AbilityUseData,
  draft: AbilityUseData,
): AbilityUsePatch {
  const patch: AbilityUsePatch = {};
  if (baseline.name !== draft.name) patch.name = draft.name;
  if (baseline.description !== draft.description) patch.description = draft.description;
  if (
    baseline.cost.source !== draft.cost.source ||
    baseline.cost.amount !== draft.cost.amount
  ) {
    patch.cost = draft.cost;
  }
  if (baseline.minimumLevel !== draft.minimumLevel) {
    patch.minimumLevel = draft.minimumLevel;
  }
  return patch;
}

export function isAbilityUseAvailable(
  use: AbilityUseData,
  level: number,
): boolean {
  return use.minimumLevel === null || level >= use.minimumLevel;
}
