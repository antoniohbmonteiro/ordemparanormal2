import { ABILITY_ITEM_TYPE } from "../../../config/system-config";
import { readAbilityCost } from "../../../core/abilities/ability-cost";
import {
  readAbilityResource,
  type AbilityResourceData,
} from "../../../core/abilities/ability-resource";

export type AbilityCostView =
  | { readonly kind: "none"; readonly isNone: true }
  | {
      readonly kind: "determination";
      readonly isDetermination: true;
      readonly amount: number;
    }
  | {
      readonly kind: "resource";
      readonly isResource: true;
      readonly amount: number;
    }
  | { readonly kind: "invalid"; readonly isInvalid: true };

export interface OwnedAbilityView {
  readonly id: string;
  readonly name: string;
  readonly img: string;
  readonly description: string;
  readonly cost: AbilityCostView;
  readonly resource: AbilityResourceData | null;
}

function readDescription(system: unknown): string {
  if (!system || typeof system !== "object") return "";
  const description = (system as { readonly description?: unknown }).description;
  return typeof description === "string" ? description : "";
}

function createCostView(system: unknown): AbilityCostView {
  if (!system || typeof system !== "object") {
    return { kind: "invalid", isInvalid: true };
  }
  const abilitySystem = system as { readonly cost?: unknown };
  const cost = readAbilityCost(abilitySystem.cost);
  if (!cost) return { kind: "invalid", isInvalid: true };
  if (cost.source === "none") return { kind: "none", isNone: true };
  if (cost.source === "determination") {
    return {
      kind: "determination",
      isDetermination: true,
      amount: cost.amount,
    };
  }

  const resource = readAbilityResource(
    (system as { readonly resource?: unknown }).resource,
  );
  return resource
    ? {
        kind: "resource",
        isResource: true,
        amount: cost.amount,
      }
    : { kind: "invalid", isInvalid: true };
}

export function collectOwnedAbilities(
  items: Iterable<foundry.documents.Item>,
): readonly OwnedAbilityView[] {
  return [...items]
    .filter(
      (item): item is foundry.documents.Item & { readonly id: string } =>
        item.type === ABILITY_ITEM_TYPE && typeof item.id === "string",
    )
    .sort((left, right) => left.sort - right.sort)
    .map((item) => ({
      id: item.id,
      name: item.name,
      img: item.img ?? "icons/svg/item-bag.svg",
      description: readDescription(item.system),
      cost: createCostView(item.system),
      resource: readAbilityResource(
        (item.system as unknown as { readonly resource?: unknown }).resource,
      ),
    }));
}
