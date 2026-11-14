import { SYSTEM_ID } from "../../config/system-config";
import { THREAT_I18N } from "../../ui/actor/threat-sheet-view-model";

export const THREAT_TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/actor`;
export const localizeThreat = (key: string): string => game.i18n.localize(`${THREAT_I18N}.${key}`);

interface EditorOption {
  readonly value: string;
  readonly label: string;
}

interface EditorField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly required?: boolean;
  readonly multiline?: boolean;
  readonly options?: readonly EditorOption[];
  readonly suggestions?: readonly string[];
}

export async function editThreatFields<T>(
  title: string, fields: readonly EditorField[], read: (data: FormData) => T,
): Promise<T | null> {
  const content = await foundry.applications.handlebars.renderTemplate(`${THREAT_TEMPLATE_ROOT}/threat-editor.hbs`, {
    fields: fields.map((field) => ({
      ...field, options: field.options?.map((option) => ({ ...option, selected: option.value === field.value })),
    })),
  });
  const result = await foundry.applications.api.DialogV2.input<T | null>({
    content,
    window: { title, resizable: true },
    position: { width: 465 },
    modal: true,
    rejectClose: false,
    buttons: [{ action: "cancel", label: `${THREAT_I18N}.Cancel`, callback: () => null }],
    ok: {
      action: "save",
      label: `${THREAT_I18N}.Save`,
      callback: (_event, button) => {
        if (!button.form?.reportValidity()) return null;
        return read(new FormData(button.form));
      },
    },
  });
  return result ?? null;
}

export function readThreatText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}
