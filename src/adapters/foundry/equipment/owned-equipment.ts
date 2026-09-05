import { EQUIPMENT_ITEM_TYPE } from "../../../config/system-config";
import { isEquipmentCategory, type EquipmentCategory } from "../../../core/equipment/equipment-category";
import {
  readEquipmentUses,
  type EquipmentUsesData,
} from "../../../core/equipment/equipment-uses";

export interface OwnedEquipmentView {
  readonly id: string;
  readonly name: string;
  readonly img: string;
  readonly description: string;
  readonly category: EquipmentCategory;
  readonly uses: EquipmentUsesData | null;
}

function readDescription(system: unknown): string {
  if (!system || typeof system !== "object") return "";
  const description = (system as { readonly description?: unknown }).description;
  return typeof description === "string" ? description : "";
}

function readCategory(system: unknown): EquipmentCategory {
  if (!system || typeof system !== "object") return "general";
  const category = (system as { readonly category?: unknown }).category;
  return isEquipmentCategory(category) ? category : "general";
}

export function collectOwnedEquipment(
  items: Iterable<foundry.documents.Item>,
): readonly OwnedEquipmentView[] {
  return [...items]
    .filter(
      (item): item is foundry.documents.Item & { readonly id: string } =>
        item.type === EQUIPMENT_ITEM_TYPE && typeof item.id === "string",
    )
    .sort((left, right) => left.sort - right.sort)
    .map((item) => ({
      id: item.id,
      name: item.name,
      img: item.img ?? "icons/svg/item-bag.svg",
      description: readDescription(item.system),
      category: readCategory(item.system),
      uses: readEquipmentUses(
        (item.system as unknown as { readonly uses?: unknown }).uses,
      ),
    }));
}
