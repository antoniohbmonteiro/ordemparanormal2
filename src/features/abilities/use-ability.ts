import { ABILITY_ITEM_TYPE } from "../../config/system-config";
import {
  readAbilityCost,
  type AbilityCostSource,
} from "../../core/abilities/ability-cost";
import { readAbilityResource } from "../../core/abilities/ability-resource";

export type AbilityUseResult =
  | {
      readonly status: "success";
      readonly source: AbilityCostSource;
      readonly amount: number;
      readonly remaining: number | null;
    }
  | { readonly status: "forbidden" }
  | {
      readonly status: "invalid";
      readonly reason:
        | "wrong-type"
        | "not-owned"
        | "malformed-cost"
        | "missing-resource";
    }
  | {
      readonly status: "insufficient";
      readonly source: "determination" | "resource";
      readonly required: number;
      readonly available: number;
    };

function readDetermination(actor: foundry.documents.Actor): number | null {
  const system = actor.system as unknown as {
    readonly resources?: {
      readonly determination?: { readonly value?: unknown };
    };
  };
  const value = system.resources?.determination?.value;
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export async function useAbility(
  actor: foundry.documents.Actor,
  ability: foundry.documents.Item,
): Promise<AbilityUseResult> {
  if (ability.type !== ABILITY_ITEM_TYPE) {
    return { status: "invalid", reason: "wrong-type" };
  }
  if (!ability.id || ability.actor !== actor) {
    return { status: "invalid", reason: "not-owned" };
  }
  if (!actor.isOwner && !game.user.isGM) return { status: "forbidden" };

  const system = ability.system as unknown as {
    readonly cost?: unknown;
    readonly resource?: unknown;
  };
  const cost = readAbilityCost(system.cost);
  if (!cost) return { status: "invalid", reason: "malformed-cost" };

  if (cost.source === "none") {
    return { status: "success", source: "none", amount: 0, remaining: null };
  }

  if (cost.source === "determination") {
    const available = readDetermination(actor);
    if (available === null) {
      return { status: "invalid", reason: "malformed-cost" };
    }
    if (available < cost.amount) {
      return {
        status: "insufficient",
        source: "determination",
        required: cost.amount,
        available,
      };
    }

    const remaining = available - cost.amount;
    await actor.update({ "system.resources.determination.value": remaining });
    return {
      status: "success",
      source: "determination",
      amount: cost.amount,
      remaining,
    };
  }

  const resource = readAbilityResource(system.resource);
  if (!resource) {
    return { status: "invalid", reason: "missing-resource" };
  }
  if (resource.value < cost.amount) {
    return {
      status: "insufficient",
      source: "resource",
      required: cost.amount,
      available: resource.value,
    };
  }

  const remaining = resource.value - cost.amount;
  await ability.update({ "system.resource.value": remaining });
  return {
    status: "success",
    source: "resource",
    amount: cost.amount,
    remaining,
  };
}
