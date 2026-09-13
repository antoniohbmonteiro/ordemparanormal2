import type { AbilityUseCostPlan } from "../../../application/abilities/ability-use-cost-plan";

const actorQueues = new WeakMap<object, Promise<void>>();

export function enqueueActorAbilityCostOperation<T>(
  actor: foundry.documents.Actor,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = actorQueues.get(actor) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  actorQueues.set(actor, result.then(() => undefined, () => undefined));
  return result;
}

export async function payAbilityUseCostPlan(
  actor: foundry.documents.Actor,
  plan: AbilityUseCostPlan,
): Promise<void> {
  const actorUpdate: Record<string, number> = {};
  if (plan.health) actorUpdate["system.resources.health.value"] = plan.health.remaining;
  if (plan.determination) actorUpdate["system.resources.determination.value"] = plan.determination.remaining;
  if (Object.keys(actorUpdate).length > 0) await actor.update(actorUpdate);

  const itemUpdates = Object.entries(plan.abilityResources).map(([abilityId, resource]) => ({
    _id: abilityId,
    "system.resource.value": resource.remaining,
  }));
  if (itemUpdates.length > 0) await actor.updateEmbeddedDocuments("Item", itemUpdates);
}
