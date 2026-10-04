import type { EquipmentUseData } from "../../core/equipment/equipment-use";
import { planEquipmentUse } from "../../core/equipment/equipment-use-plan";

export async function selectEquipmentUse(equipment: foundry.documents.Item,
  forms: readonly EquipmentUseData[]): Promise<string | null> {
  const system = equipment.system as { uses?: unknown };
  const options = forms.map(use => {
    const available = planEquipmentUse(forms, system.uses, use.id).status === "ready";
    const cost = game.i18n.localize(`ORDEMPARANORMAL2.EquipmentUse.${use.consumesUse ? "Consumes" : "Free"}`);
    return `<option value="${foundry.utils.escapeHTML(use.id)}"${available ? "" : " disabled"}>${foundry.utils.escapeHTML(use.name)} · ${cost}</option>`;
  }).join("");
  const result = await foundry.applications.api.DialogV2.input<string>({
    classes: ["ordemparanormal2"], modal: true, rejectClose: false,
    window: { title: equipment.name },
    content: `<label>${game.i18n.localize("ORDEMPARANORMAL2.EquipmentUse.SelectForm")}<select name="useFormId"><option value="" selected disabled>—</option>${options}</select></label>`,
    ok: { action: "use", label: "ORDEMPARANORMAL2.EquipmentUse.Use", callback: (_event, _button, dialog) =>
      dialog.element.querySelector<HTMLSelectElement>('select[name="useFormId"]')?.value ?? "" },
  });
  return result && forms.some(form => form.id === result) ? result : null;
}
