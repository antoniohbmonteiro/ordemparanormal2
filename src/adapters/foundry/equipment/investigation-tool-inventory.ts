import { readEquipmentUseForms } from "../../../core/equipment/equipment-use";
import { planEquipmentUse } from "../../../core/equipment/equipment-use-plan";
import type { PoiInvestigationToolView } from "../../../documents/item/point-of-interest-data";
import { collectOwnedEquipment } from "./owned-equipment";

export function investigationToolInventory(actor: foundry.documents.Actor): readonly PoiInvestigationToolView[] {
  const items = [...actor.items as unknown as Iterable<foundry.documents.Item>];
  return collectOwnedEquipment(items).filter(item => item.category === "tool").map(({ id, name, img, uses }) => {
    const system = items.find(item => item.id === id)!.system as { useForms?: unknown; uses?: unknown };
    const forms = readEquipmentUseForms(system.useForms);
    const canUse = forms !== null && (forms.length ? forms.some(form =>
      planEquipmentUse(forms, system.uses, form.id).status === "ready")
      : planEquipmentUse(forms, system.uses, null).status === "ready");
    return { id, name, img, uses, canUse };
  });
}
