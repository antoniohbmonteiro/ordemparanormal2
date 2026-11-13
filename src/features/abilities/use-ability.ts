import { ABILITY_ITEM_TYPE, THREAT_ACTOR_TYPE } from "../../config/system-config";
import type { AbilityCostSource } from "../../core/abilities/ability-cost";
import { readAbilityCost } from "../../core/abilities/ability-cost";
import { readAbilityResource } from "../../core/abilities/ability-resource";
import { isAbilityUseAvailable, readAbilityUses, resolveAbilityUse, type AbilityUseData } from "../../core/abilities/ability-use";
import { resolveAbilityUseCostPlan } from "../../application/abilities/ability-use-cost-plan";
import { enqueueActorAbilityCostOperation, payAbilityUseCostPlan } from "../../adapters/foundry/abilities/ability-use-cost-payment";

export type AbilityUseResult =
  | { readonly status: "success"; readonly use: AbilityUseData; readonly source: AbilityCostSource; readonly amount: number; readonly remaining: number | null }
  | { readonly status: "locked"; readonly currentLevel: number; readonly requiredLevel: number }
  | { readonly status: "forbidden" }
  | { readonly status: "unavailable"; readonly reason: "minimum-level" | "determination" }
  | { readonly status: "changed" }
  | { readonly status: "invalid"; readonly reason: "wrong-type" | "not-owned" | "malformed-uses" | "missing-use" | "malformed-level" | "malformed-cost" | "missing-resource" | "check-only" }
  | { readonly status: "insufficient"; readonly source: "health" | "determination" | "resource"; readonly required: number; readonly available: number };

type AgentResourceCostSource = Extract<AbilityCostSource, "health" | "determination">;
function readAgentResource(actor: foundry.documents.Actor, source: AgentResourceCostSource): number | null {
  const system = actor.system as unknown as {
    readonly resources?: {
      readonly health?: { readonly value?: unknown };
      readonly determination?: { readonly value?: unknown };
    };
  };
  const value = source === "health"
    ? system.resources?.health?.value
    : system.resources?.determination?.value;
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function readAgentLevel(actor: foundry.documents.Actor): number | null {
  const level = (actor.system as unknown as { readonly level?: unknown }).level;
  return Number.isInteger(level) && Number(level) >= 1 && Number(level) <= 10 ? Number(level) : null;
}

export function threatAbilityRestriction(use: AbilityUseData): "minimum-level" | "determination" | null {
  if (use.minimumLevel !== null) return "minimum-level";
  return use.cost.source === "determination" ? "determination" : null;
}

function checkAvailability(actor: foundry.documents.Actor, use: AbilityUseData): AbilityUseResult | undefined {
  if (actor.type === THREAT_ACTOR_TYPE) {
    const reason = threatAbilityRestriction(use);
    return reason ? { status: "unavailable", reason } : undefined;
  }
  const level = readAgentLevel(actor);
  if (level === null) return { status: "invalid", reason: "malformed-level" };
  if (use.minimumLevel !== null && !isAbilityUseAvailable(use, level)) {
    return { status: "locked", currentLevel: level, requiredLevel: use.minimumLevel };
  }
}

interface AbilityUseConfirmation {
  readonly expected: AbilityUseData;
  readonly evaluate: () => Promise<boolean>;
}

export async function useAbility(
  actor: foundry.documents.Actor, ability: foundry.documents.Item, useId: string,
  confirmation?: AbilityUseConfirmation,
): Promise<AbilityUseResult> {
  if (ability.type !== ABILITY_ITEM_TYPE) return { status: "invalid", reason: "wrong-type" };
  const abilityId = ability.id;
  if (!abilityId || ability.actor !== actor || (actor.items && actor.items.get(abilityId) !== ability)) {
    return { status: "invalid", reason: "not-owned" };
  }
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
  const unavailable = checkAvailability(actor, use);
  if (unavailable) return unavailable;
  if (use.checkIntegration) return { status: "invalid", reason: "check-only" };
  if (use.combatAction?.check && !confirmation) return { status: "invalid", reason: "check-only" };

  const cost = use.cost;
  if (cost.source === "none" && !confirmation) return { status: "success", use, source: "none", amount: 0, remaining: null };
  return enqueueActorAbilityCostOperation(actor, async () => {
    if ((!actor.isOwner && !game.user.isGM) || (actor.items && actor.items.get(abilityId) !== ability)) {
      return { status: "forbidden" };
    }
    const currentSystem = ability.system as unknown as { readonly uses?: unknown; readonly resource?: unknown };
    const currentUses = readAbilityUses(currentSystem.uses);
    const currentUse = currentUses ? resolveAbilityUse(currentUses, useId) : null;
    if (!currentUse) return { status: "invalid", reason: "missing-use" } as const;
    if (currentUse.checkIntegration) return { status: "invalid", reason: "check-only" } as const;
    const unavailable = checkAvailability(actor, currentUse);
    if (unavailable) return unavailable;
    if (confirmation && JSON.stringify(currentUse) !== JSON.stringify(confirmation.expected)) return { status: "changed" };
    if (currentUse.combatAction?.check && !confirmation) return { status: "changed" };
    const threat = actor.type === THREAT_ACTOR_TYPE;
    const health = !threat || currentUse.cost.source === "health" ? readAgentResource(actor, "health") : 0;
    const determination = threat ? 0 : readAgentResource(actor, "determination");
    if (health === null || determination === null) return { status: "invalid", reason: "malformed-cost" } as const;
    const resource = readAbilityResource(currentSystem.resource);
    if (currentUse.cost.source === "resource" && !resource) return { status: "invalid", reason: "missing-resource" } as const;
    const result = resolveAbilityUseCostPlan(
      [{ abilityId, useId, cost: currentUse.cost }],
      { health, determination, abilityResources: { [abilityId]: resource?.value ?? null } },
    );
    if (result.status === "insufficient") return {
      status: "insufficient",
      source: result.source,
      required: result.required,
      available: result.available,
    } as const;
    if (confirmation) {
      if (!await confirmation.evaluate()) return { status: "changed" };
      if (!actor.isOwner && !game.user.isGM) return { status: "forbidden" };
      const freshUses = readAbilityUses(ability.system && "uses" in ability.system ? ability.system.uses : undefined);
      if ((actor.items && actor.items.get(abilityId) !== ability)
        || JSON.stringify(freshUses && resolveAbilityUse(freshUses, useId)) !== JSON.stringify(currentUse)
        || checkAvailability(actor, currentUse)
        || (currentUse.cost.source === "health" && readAgentResource(actor, "health") !== health)
        || (currentUse.cost.source === "determination" && readAgentResource(actor, "determination") !== determination)
        || (currentUse.cost.source === "resource" && readAbilityResource(
          ability.system && "resource" in ability.system ? ability.system.resource : undefined,
        )?.value !== resource?.value)) return { status: "changed" };
    }
    await payAbilityUseCostPlan(actor, result.plan);
    const remaining = currentUse.cost.source === "health"
      ? result.plan.health?.remaining ?? health
      : currentUse.cost.source === "determination"
        ? result.plan.determination?.remaining ?? determination
        : currentUse.cost.source === "resource"
          ? result.plan.abilityResources[abilityId]?.remaining ?? resource?.value ?? null
          : null;
    return { status: "success", use: currentUse, source: currentUse.cost.source, amount: currentUse.cost.amount, remaining } as const;
  });
}
