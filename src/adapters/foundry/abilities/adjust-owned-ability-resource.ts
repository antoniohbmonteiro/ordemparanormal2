import { ABILITY_ITEM_TYPE } from "../../../config/system-config";
import {
  adjustAbilityResourceValue,
  readAbilityResource,
  type AbilityResourceAdjustment,
} from "../../../core/abilities/ability-resource";

export type OwnedAbilityResourceAdjustmentResult =
  | { readonly status: "updated"; readonly value: number }
  | { readonly status: "unchanged"; readonly value: number }
  | { readonly status: "invalid" };

export async function adjustOwnedAbilityResource(
  actor: foundry.documents.Actor,
  abilityId: string,
  adjustment: AbilityResourceAdjustment,
): Promise<OwnedAbilityResourceAdjustmentResult> {
  const ability = actor.getEmbeddedDocument(
    "Item",
    abilityId,
  ) as foundry.documents.Item | null;
  if (ability?.type !== ABILITY_ITEM_TYPE) return { status: "invalid" };

  const resource = readAbilityResource(
    (ability.system as unknown as { readonly resource?: unknown }).resource,
  );
  if (!resource) return { status: "invalid" };

  const adjusted = adjustAbilityResourceValue(resource, adjustment);
  if (adjusted.value === resource.value) {
    return { status: "unchanged", value: resource.value };
  }

  await ability.update({ "system.resource.value": adjusted.value });
  return { status: "updated", value: adjusted.value };
}
