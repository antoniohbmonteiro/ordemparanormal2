import type { AgentCheckAbilitySource } from "../../../application/checks/check-ability-use-state";
import { ABILITY_ITEM_TYPE, AGENT_ACTOR_TYPE } from "../../../config/system-config";
import { readAbilityResource } from "../../../core/abilities/ability-resource";
import { readAbilityUses } from "../../../core/abilities/ability-use";

function readNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`Invalid value at ${path}.`);
  return Number(value);
}

export function readAgentCheckAbilities(actor: foundry.documents.Actor): AgentCheckAbilitySource {
  if (actor.type !== AGENT_ACTOR_TYPE) throw new Error(`Cannot read check Abilities for Actor type ${actor.type}.`);
  const system = actor.system as unknown as {
    readonly level?: unknown;
    readonly resources?: {
      readonly health?: { readonly value?: unknown };
      readonly determination?: { readonly value?: unknown };
    };
  };
  const level = readNonNegativeInteger(system.level, "system.level");
  if (level < 1 || level > 10) throw new Error("Invalid Agent level.");
  const health = readNonNegativeInteger(system.resources?.health?.value, "system.resources.health.value");
  const determination = readNonNegativeInteger(system.resources?.determination?.value, "system.resources.determination.value");
  const abilities = [...actor.items]
    .filter((item) => item.type === ABILITY_ITEM_TYPE && typeof item.id === "string")
    .sort((left, right) => left.sort - right.sort)
    .map((item) => {
      const itemId = item.id;
      if (typeof itemId !== "string") throw new Error("Owned Ability is missing its id.");
      const itemSystem = item.system as unknown as { readonly uses?: unknown; readonly resource?: unknown };
      const uses = readAbilityUses(itemSystem.uses);
      if (!uses) throw new Error(`Ability ${itemId} has invalid uses.`);
      const resource = itemSystem.resource === null || itemSystem.resource === undefined
        ? null
        : readAbilityResource(itemSystem.resource);
      if (itemSystem.resource !== null && itemSystem.resource !== undefined && !resource) {
        throw new Error(`Ability ${itemId} has an invalid resource.`);
      }
      return { id: itemId, name: item.name, resource, uses };
    });
  return { level, health, determination, abilities };
}
