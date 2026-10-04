import { isRadioPuzzleConfig, type RadioPuzzleConfig } from "../../core/equipment/radio-puzzle";

export async function editRadioPuzzle(initial?: RadioPuzzleConfig): Promise<RadioPuzzleConfig | null> {
  const localize = (key: string) => game.i18n.localize(`ORDEMPARANORMAL2.Radio.${key}`);
  const draft = { trueFragments: [...initial?.trueFragments ?? [""]], falseFragments: [...initial?.falseFragments ?? []] };
  const resolve = (): RadioPuzzleConfig | null => {
    const config = { type: "radio" as const, trueFragments: draft.trueFragments.map(text => text.trim()),
      falseFragments: draft.falseFragments.map(text => text.trim()) };
    return isRadioPuzzleConfig(config) ? config : null;
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/ordemparanormal2/templates/item/radio-puzzle-config-dialog.hbs", {});
  return foundry.applications.api.DialogV2.input<RadioPuzzleConfig | null>({
    classes: ["ordemparanormal2"], modal: true, rejectClose: false, position: { width: 520 },
    window: { title: localize("PuzzleConfiguration"), resizable: true }, content,
    render: (_event, dialog) => {
      const root = dialog.element.querySelector<HTMLElement>(".op2-radio-config");
      const save = dialog.element.querySelector<HTMLButtonElement>('[data-action="save"]');
      if (!root || !save) return;
      const sync = () => {
        save.disabled = resolve() === null;
        const preview = root.querySelector<HTMLElement>("[data-radio-preview]");
        if (preview) preview.textContent = draft.trueFragments.join(" ");
        const error = root.querySelector<HTMLElement>("[data-radio-error]");
        if (error) error.textContent = resolve() ? "" : localize("InvalidPuzzle");
      };
      const draw = () => {
        for (const kind of ["trueFragments", "falseFragments"] as const) {
          const list = root.querySelector<HTMLElement>(`[data-radio-list="${kind}"]`);
          if (!list) continue;
          list.innerHTML = draft[kind].map((text, index) => `<div class="op2-radio-config-row"><input type="text" data-kind="${kind}" data-index="${index}" value="${foundry.utils.escapeHTML(text)}" aria-label="${localize("Fragment")} ${index + 1}"><button type="button" data-radio-edit="up" data-kind="${kind}" data-index="${index}"${index === 0 ? " disabled" : ""} aria-label="${localize("MoveUp")}">↑</button><button type="button" data-radio-edit="down" data-kind="${kind}" data-index="${index}"${index === draft[kind].length - 1 ? " disabled" : ""} aria-label="${localize("MoveDown")}">↓</button><button type="button" data-radio-edit="remove" data-kind="${kind}" data-index="${index}">${localize("Remove")}</button></div>`).join("");
        }
        sync();
      };
      root.addEventListener("input", event => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const kind = target.dataset.kind;
        if (kind !== "trueFragments" && kind !== "falseFragments") return;
        draft[kind][Number(target.dataset.index)] = target.value; sync();
      });
      root.addEventListener("click", event => {
        const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-radio-edit]") : null;
        if (!target || target.disabled) return;
        event.preventDefault();
        const kind = target.dataset.kind;
        if (kind !== "trueFragments" && kind !== "falseFragments") return;
        const values = draft[kind], index = Number(target.dataset.index);
        const action = target.dataset.radioEdit;
        if (action === "add") values.push("");
        else if (Number.isInteger(index) && index >= 0 && index < values.length) {
          if (action === "remove") values.splice(index, 1);
          else { const other = index + (action === "up" ? -1 : 1);
            if (other >= 0 && other < values.length) [values[index], values[other]] = [values[other]!, values[index]!]; }
        }
        draw();
      });
      draw();
    },
    ok: { action: "save", label: localize("Save"), callback: () => {
      const config = resolve(); if (!config) throw new Error("Invalid radio puzzle."); return config;
    } },
  });
}
