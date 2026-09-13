import { ABILITY_ITEM_TYPE } from "../../config/system-config";
import type { AbilityCostSource } from "../../core/abilities/ability-cost";
import { readAbilityCost } from "../../core/abilities/ability-cost";
import { readAbilityResource } from "../../core/abilities/ability-resource";
import { isAbilityUseAvailable, readAbilityUses, resolveAbilityUse, type AbilityUseData } from "../../core/abilities/ability-use";

export type AbilityUseResult =
  | { readonly status: "success"; readonly use: AbilityUseData; readonly source: AbilityCostSource; readonly amount: number; readonly remaining: number | null }
  | { readonly status: "locked"; readonly currentLevel: number; readonly requiredLevel: number }
  | { readonly status: "forbidden" }
  | { readonly status: "invalid"; readonly reason: "wrong-type" | "not-owned" | "malformed-uses" | "missing-use" | "malformed-level" | "malformed-cost" | "missing-resource" }
  | { readonly status: "insufficient"; readonly source: "determination" | "resource"; readonly required: number; readonly available: number };

function readDetermination(actor: foundry.documents.Actor): number | null {
  const system = actor.system as unknown as { readonly resources?: { readonly determination?: { readonly value?: unknown } } };
  const value = system.resources?.determination?.value;
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function readAgentLevel(actor: foundry.documents.Actor): number | null {
  const level = (actor.system as unknown as { readonly level?: unknown }).level;
  return Number.isInteger(level) && Number(level) >= 1 && Number(level) <= 10 ? Number(level) : null;
}

export async function useAbility(actor: foundry.documents.Actor, ability: foundry.documents.Item, useId: string): Promise<AbilityUseResult> {
  if (ability.type !== ABILITY_ITEM_TYPE) return { status: "invalid", reason: "wrong-type" };
  if (!ability.id || ability.actor !== actor) return { status: "invalid", reason: "not-owned" };
  if (!actor.isOwner && !game.user.isGM) return { status: "forbidden" };

  const system = ability.system as unknown as { readonly uses?: unknown; readonly resource?: unknown };
  const uses = readAbilityUses(system.uses);
  if (!uses) {
    const rawUse = Array.isArray(system.uses)
      ? system.uses.find((value) => value && typeof value === "object" && (value as { readonly id?: unknown }).id === useId)
      : null;
    if (rawUse && !readAbilityCost((rawUse as { readonly cost?: unknown }).cost)) {
      return { status: "invalid", reason: "malformed-cost" };
    }
    return { status: "invalid", reason: "malformed-uses" };
  }
  const use = resolveAbilityUse(uses, useId);
  if (!use) return { status: "invalid", reason: "missing-use" };
  const level = readAgentLevel(actor);
  if (level === null) return { status: "invalid", reason: "malformed-level" };
  if (!isAbilityUseAvailable(use, level)) return { status: "locked", currentLevel: level, requiredLevel: use.minimumLevel! };

  const cost = use.cost;
  if (cost.source === "none") return { status: "success", use, source: "none", amount: 0, remaining: null };
  if (cost.source === "determination") {
    const available = readDetermination(actor);
    if (available === null) return { status: "invalid", reason: "malformed-cost" };
    if (available < cost.amount) return { status: "insufficient", source: "determination", required: cost.amount, available };
    const remaining = available - cost.amount;
    await actor.update({ "system.resources.determination.value": remaining });
    return { status: "success", use, source: "determination", amount: cost.amount, remaining };
  }

  const resource = readAbilityResource(system.resource);
  if (!resource) return { status: "invalid", reason: "missing-resource" };
  if (resource.value < cost.amount) return { status: "insufficient", source: "resource", required: cost.amount, available: resource.value };
  const remaining = resource.value - cost.amount;
  await ability.update({ "system.resource.value": remaining });
  return { status: "success", use, source: "resource", amount: cost.amount, remaining };
}
