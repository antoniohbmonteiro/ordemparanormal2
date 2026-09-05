export interface AbilityCardViewModel {
  readonly name: string;
  readonly img: string;
  readonly hasDescription: boolean;
  readonly description: string;
}

export interface AbilityCardInput {
  readonly name: string;
  readonly img: string;
  /** Already enriched description HTML. */
  readonly description: string;
}

const FALLBACK_IMAGE = "icons/svg/item-bag.svg";

export function buildAbilityCardViewModel(
  input: AbilityCardInput,
): AbilityCardViewModel {
  const name = input.name.trim();
  const img = input.img.trim() || FALLBACK_IMAGE;
  const description = input.description.trim();

  return {
    name,
    img,
    hasDescription: description.length > 0,
    description,
  };
}
