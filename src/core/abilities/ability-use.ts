import {
  readAbilityCost,
  type AbilityCostData,
} from "./ability-cost";
import { AGENT_ATTRIBUTE_KEYS, type AttributeKey } from "../actors/agent-attributes";
import { isSkillKey, type SkillKey } from "../../config/skills";
import { NORMAL_DIE_STEPS, type NormalDieStep } from "../dice/die-step";

export type AbilityUseCheckApplicability =
  | { readonly type: "any" }
  | { readonly type: "attribute"; readonly attribute: AttributeKey }
  | { readonly type: "skill"; readonly skill: SkillKey };

export interface ExtraDieAbilityUseCheckModification {
  readonly type: "extraDie";
  readonly applicability: AbilityUseCheckApplicability;
  readonly die: NormalDieStep;
}

export type AbilityUseCheckModification = ExtraDieAbilityUseCheckModification;

export interface AbilityUseCheckIntegration {
  readonly modification: AbilityUseCheckModification;
}

export interface AbilityUseData {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cost: AbilityCostData;
  readonly minimumLevel: number | null;
  readonly checkIntegration: AbilityUseCheckIntegration | null;
}

export type AbilityUsePatch = Partial<{
  name: string;
  description: string;
  cost: AbilityCostData;
  minimumLevel: number | null;
  checkIntegration: AbilityUseCheckIntegration | null;
}>;

export type AbilityUseMoveDirection = "up" | "down";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readAbilityUseCheckIntegration(
  value: unknown,
): AbilityUseCheckIntegration | null {
  if (!isRecord(value) || !isRecord(value.modification)) return null;
  const modification = value.modification;
  if (modification.type !== "extraDie") return null;
  if (!NORMAL_DIE_STEPS.includes(modification.die as NormalDieStep)) return null;
  if (!isRecord(modification.applicability)) return null;
  const applicability = modification.applicability;

  let parsedApplicability: AbilityUseCheckApplicability;
  if (applicability.type === "any") {
    parsedApplicability = { type: "any" };
  } else if (
    applicability.type === "attribute" &&
    AGENT_ATTRIBUTE_KEYS.includes(applicability.attribute as AttributeKey)
  ) {
    parsedApplicability = {
      type: "attribute",
      attribute: applicability.attribute as AttributeKey,
    };
  } else if (
    applicability.type === "skill" &&
    isSkillKey(applicability.skill) &&
    applicability.skill !== "aptitude"
  ) {
    parsedApplicability = { type: "skill", skill: applicability.skill };
  } else {
    return null;
  }

  return {
    modification: {
      type: "extraDie",
      applicability: parsedApplicability,
      die: modification.die as NormalDieStep,
    },
  };
}

export function areAbilityUseCheckIntegrationsEqual(
  left: AbilityUseCheckIntegration | null,
  right: AbilityUseCheckIntegration | null,
): boolean {
  if (left === null || right === null) return left === right;
  const leftModification = left.modification;
  const rightModification = right.modification;
  if (
    leftModification.type !== rightModification.type ||
    leftModification.die !== rightModification.die ||
    leftModification.applicability.type !== rightModification.applicability.type
  ) return false;
  if (leftModification.applicability.type === "any") return true;
  if (
    leftModification.applicability.type === "attribute" &&
    rightModification.applicability.type === "attribute"
  ) {
    return leftModification.applicability.attribute === rightModification.applicability.attribute;
  }
  return (
    leftModification.applicability.type === "skill" &&
    rightModification.applicability.type === "skill" &&
    leftModification.applicability.skill === rightModification.applicability.skill
  );
}

export function readAbilityUse(value: unknown): AbilityUseData | null {
  if (!value || typeof value !== "object") return null;
  const use = value as Partial<AbilityUseData>;
  const id = typeof use.id === "string" ? use.id.trim() : "";
  const name = typeof use.name === "string" ? use.name.trim() : "";
  const description = typeof use.description === "string" ? use.description : null;
  const cost = readAbilityCost(use.cost);
  const minimumLevel = use.minimumLevel;
  const rawCheckIntegration = (use as { readonly checkIntegration?: unknown }).checkIntegration;
  const checkIntegration = rawCheckIntegration === undefined || rawCheckIntegration === null
    ? null
    : readAbilityUseCheckIntegration(rawCheckIntegration);

  if (
    !id || !name || description === null || !cost ||
    (rawCheckIntegration !== undefined && rawCheckIntegration !== null && !checkIntegration)
  ) return null;
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
    checkIntegration,
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
  if (!areAbilityUseCheckIntegrationsEqual(
    baseline.checkIntegration,
    draft.checkIntegration,
  )) {
    patch.checkIntegration = draft.checkIntegration;
  }
  return patch;
}

export function isAbilityUseAvailable(
  use: AbilityUseData,
  level: number,
): boolean {
  return use.minimumLevel === null || level >= use.minimumLevel;
}
