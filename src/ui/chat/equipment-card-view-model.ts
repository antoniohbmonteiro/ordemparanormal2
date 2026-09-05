import type { EquipmentCategory } from "../../core/equipment/equipment-category";
import type { EquipmentUsesData } from "../../core/equipment/equipment-uses";

export interface EquipmentCardViewModel {
  readonly name: string;
  readonly img: string;
  readonly categoryLabelKey: string;
  readonly hasDescription: boolean;
  readonly description: string;
  readonly hasUses: boolean;
  readonly uses: EquipmentUsesData | null;
}

export interface EquipmentCardInput {
  readonly name: string;
  readonly img: string;
  readonly category: EquipmentCategory;
  /** Already enriched description HTML. */
  readonly description: string;
  readonly uses: EquipmentUsesData | null;
}

const FALLBACK_IMAGE = "icons/svg/item-bag.svg";

export function buildEquipmentCardViewModel(
  input: EquipmentCardInput,
): EquipmentCardViewModel {
  const name = input.name.trim();
  const img = input.img.trim() || FALLBACK_IMAGE;
  const description = input.description.trim();

  return {
    name,
    img,
    categoryLabelKey: `ORDEMPARANORMAL2.Equipment.Categories.${input.category}`,
    hasDescription: description.length > 0,
    description,
    hasUses: input.uses !== null,
    uses: input.uses,
  };
}
