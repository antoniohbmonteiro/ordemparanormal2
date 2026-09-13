import type { AbilityCostSource } from "../../core/abilities/ability-cost";

export interface AbilityCardViewModel {
  readonly name: string;
  readonly img: string;
  readonly subtitle: string;
  readonly hasDescription: boolean;
  readonly description: string;
  readonly hasCost: boolean;
  readonly costLabel: string;
}

export interface AbilityCardInput {
  readonly name: string;
  readonly img: string;
  readonly subtitle: string;
  readonly description: string;
  readonly cost?: { readonly source: AbilityCostSource; readonly amount: number; readonly label: string };
}

const FALLBACK_IMAGE = "icons/svg/item-bag.svg";

export function buildAbilityCardViewModel(input: AbilityCardInput): AbilityCardViewModel {
  const cost = input.cost;
  return {
    name: input.name.trim(),
    img: input.img.trim() || FALLBACK_IMAGE,
    subtitle: input.subtitle,
    hasDescription: input.description.trim().length > 0,
    description: input.description.trim(),
    hasCost: !!cost && cost.source !== "none",
    costLabel: cost?.source === "none" ? "" : cost?.label ?? "",
  };
}
