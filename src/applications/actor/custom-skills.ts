import { actorCustomSkills, updateActorCustomSkill } from "../../adapters/foundry/actors/actor-custom-skills";
import {
  canManageCustomSkills, saveWorldCustomSkill, subscribeCustomSkills, worldCustomSkillOptions,
} from "../../adapters/foundry/actors/custom-skill-catalog";
import type { ActorCheckSkill, SkillCheckSelection } from "../../application/checks/build-actor-check";
import { ATTRIBUTE_DEFINITIONS } from "../../config/attributes";
import { DEFAULT_SKILL_DIE, SKILL_DIE_STEPS, type SkillDieStep } from "../../config/skills";
import {
  isCustomSkillId, isCustomSkillKey, isCustomSpecializationId, readCustomSkillDefinition, readSkillDie,
  type CustomSkillDefinition,
} from "../../core/actors/custom-skills";

const { DialogV2 } = foundry.applications.api;
const DIALOG_CLASSES = ["ordemparanormal2", "op2-skill-dialog"];
const escape = (value: string) => foundry.utils.escapeHTML(value);
const option = (value: string, label: string, selected = false) =>
  `<option value="${escape(value)}"${selected ? " selected" : ""}>${escape(label)}</option>`;

export async function editDefinition(initial?: CustomSkillDefinition, signal?: AbortSignal) {
  if (!canManageCustomSkills() || signal?.aborted) return null;
  const id = initial?.id ?? `custom_${foundry.utils.randomID()}`;
  if (!isCustomSkillId(id)) return null;
  const fields = ATTRIBUTE_DEFINITIONS.map(({ key, labelKey }) => option(key, game.i18n.localize(labelKey), key === initial?.baseAttribute)).join("");
  const existing = initial?.kind === "specialized" ? initial.specializations : [];
  const renderSpecialization = (name: string, archived: boolean, id: string) =>
    `<div class="op2-skill-dialog__specialization" data-specialization="${id}">
      <label class="op2-skill-dialog__field">Nome da especialização<input type="text" name="specializationName" value="${escape(name)}"></label>
      <label class="op2-skill-dialog__archive"><input type="checkbox" name="specializationArchived"${archived ? " checked" : ""}> Arquivada</label></div>`;
  let detach = () => {};
  try {
    return await new Promise<CustomSkillDefinition["id"] | null>((resolve, reject) => {
      let savedId: CustomSkillDefinition["id"] | null = null;
      const dialog = new DialogV2({
        modal: true, classes: [...DIALOG_CLASSES], window: { title: initial ? "Editar perícia" : "Criar perícia", resizable: true },
        form: { closeOnSubmit: false },
        position: { width: 465 },
        content: `<div class="op2-skill-dialog__body">
          <label class="op2-skill-dialog__field">Nome<input name="name" type="text" required value="${escape(initial?.name ?? "")}"></label>
          <label class="op2-skill-dialog__field">Atributo padrão<select name="baseAttribute">${fields}</select></label>
          <label class="op2-skill-dialog__field">Tipo<select name="kind"${initial ? " disabled" : ""}>${option("simple", "Simples")}${option("specialized", "Com especializações", initial?.kind === "specialized")}</select></label>
          <fieldset data-specializations${initial?.kind === "specialized" ? "" : " hidden"}><legend>Especializações</legend>
            <div data-specialization-list>${existing.map(entry => renderSpecialization(entry.name, entry.archived, entry.id)).join("")}</div>
          <button class="op2-skill-dialog__secondary" type="button" data-add-specialization>+ Adicionar especialização</button>
          </fieldset><p data-skill-error role="alert" hidden></p></div>`,
        buttons: [
          { action: "cancel", label: "Cancelar", callback: () => dialog.close() },
          { action: "save", label: "Salvar", class: "op2-skill-dialog__primary", default: true, callback: async (_event: Event, button: HTMLButtonElement) => {
              if (signal?.aborted || !button.form?.reportValidity()) return;
              const errorField = button.form.querySelector<HTMLElement>("[data-skill-error]");
              const showError = (message: string) => {
                if (errorField) { errorField.textContent = message; errorField.hidden = false; }
              };
              const form = button.form;
              const data = new FormData(form);
              const specializations = [...form.querySelectorAll<HTMLElement>("[data-specialization]")].flatMap(row => {
                const specId = row.dataset.specialization;
                const name = row.querySelector<HTMLInputElement>('[name="specializationName"]')?.value.trim() ?? "";
                const archived = !!row.querySelector<HTMLInputElement>('[name="specializationArchived"]')?.checked;
                return isCustomSpecializationId(specId) && (name || existing.some(entry => entry.id === specId))
                  ? [{ id: specId, name, archived }] : [];
              });
              const definition = readCustomSkillDefinition({
                id, name: data.get("name"), kind: initial?.kind ?? data.get("kind"), baseAttribute: data.get("baseAttribute"),
                archived: initial?.archived ?? false, revision: initial?.revision ?? 1,
                ...((initial?.kind ?? data.get("kind")) === "specialized" ? { specializations } : {}),
              });
              if (!definition) { showError("Preencha o nome e use especializações com nomes distintos."); return; }
              try {
                savedId = await saveWorldCustomSkill(definition, initial?.revision ?? 0);
                await dialog.close();
              } catch {
                showError("Não foi possível salvar a perícia. Verifique se o nome já existe ou se o catálogo mudou.");
              }
          } },
        ],
      });
      dialog.addEventListener("close", () => resolve(savedId), { once: true });
      dialog.addEventListener("render", () => {
        const root = dialog.element;
        const abort = () => { void dialog.close(); };
        signal?.addEventListener("abort", abort, { once: true });
        detach = () => signal?.removeEventListener("abort", abort);
        if (signal?.aborted) abort();
        root.querySelector<HTMLSelectElement>('[name="kind"]')?.addEventListener("change", event => {
          const group = root.querySelector<HTMLFieldSetElement>("[data-specializations]");
          if (group && event.target instanceof HTMLSelectElement) group.hidden = event.target.value !== "specialized";
        });
        root.querySelector("[data-add-specialization]")?.addEventListener("click", () => {
          root.querySelector("[data-specialization-list]")?.insertAdjacentHTML("beforeend",
            renderSpecialization("", false, `spec_${foundry.utils.randomID()}`));
        });
      }, { once: true });
      void dialog.render({ force: true }).catch(reject);
    });
  } finally { detach(); }
}

export async function pickActorSkill(
  actor: foundry.documents.Actor, canonical: () => readonly ActorCheckSkill[],
  signal: AbortSignal,
): Promise<{ selection: SkillCheckSelection; die: SkillDieStep } | null> {
  let detach: (() => void) | undefined;
  let creation: Promise<unknown> | undefined;
  const editor = new AbortController();
  const options = () => [
    ...canonical().map(({ selection, label }) => ({ selection, label, definitionId: undefined, specialized: false })),
    ...worldCustomSkillOptions().filter(entry => !entry.archived && !readSkillDie(actorCustomSkills(actor)[entry.key]))
      .map(entry => ({ selection: { kind: "skill" as const, key: entry.key }, label: entry.label, definitionId: entry.definitionId, specialized: entry.specialized })),
  ];
  const valueOf = ({ kind, key }: SkillCheckSelection) => `${kind}:${key}`;
  try {
    const selected = await DialogV2.input<{ selection: SkillCheckSelection; die: SkillDieStep } | string | null>({
      modal: true, rejectClose: false, classes: [...DIALOG_CLASSES], window: { title: "Adicionar perícia", resizable: true },
      position: { width: 465 },
      content: `<div class="op2-skill-dialog__body">
        <label class="op2-skill-dialog__field">Perícia<select name="skill" required></select></label>
        <label class="op2-skill-dialog__field">Dado inicial<select name="die">${SKILL_DIE_STEPS.map(die => option(String(die), `d${die}`, die === DEFAULT_SKILL_DIE)).join("")}</select></label>
        ${canManageCustomSkills() ? '<button class="op2-skill-dialog__secondary" type="button" data-create-skill>+ Criar nova perícia</button>' : ""}</div>`,
      render: (_event, dialog) => {
        const select = dialog.element.querySelector<HTMLSelectElement>('[name="skill"]');
        const create = dialog.element.querySelector<HTMLButtonElement>("[data-create-skill]");
        const add = dialog.element.querySelector<HTMLButtonElement>('[data-action="add"]');
        if (!select || !add) return;
        let newDefinition: string | undefined;
        const refresh = () => {
          const selected = select.value;
          const choices = options();
          const addedSpecializations = newDefinition
            ? choices.filter(entry => entry.definitionId === newDefinition && entry.specialized) : [];
          const newKeys = new Set(addedSpecializations.map(entry => valueOf(entry.selection)));
          const ordered = [...addedSpecializations, ...choices.filter(entry => !newKeys.has(valueOf(entry.selection)))];
          select.innerHTML = option("", addedSpecializations.length ? "Escolha uma especialização" : "Selecione uma perícia")
            + ordered.map(entry => option(valueOf(entry.selection), entry.label)).join("");
          const added = newDefinition && choices.find(entry => entry.definitionId === newDefinition && !entry.specialized);
          select.value = added ? valueOf(added.selection) : choices.some(entry => selected === valueOf(entry.selection)) ? selected : "";
          add.disabled = !select.value || !!creation;
          if (create) create.disabled = !!creation || !canManageCustomSkills();
        };
        const abort = () => { editor.abort(); void dialog.close(); };
        signal.addEventListener("abort", abort, { once: true });
        detach?.();
        const unsubscribe = subscribeCustomSkills(refresh);
        detach = () => { unsubscribe(); signal.removeEventListener("abort", abort); };
        select.addEventListener("change", () => { newDefinition = undefined; add.disabled = !select.value || !!creation; });
        create?.addEventListener("click", () => {
          if (creation || !canManageCustomSkills()) return;
          creation = editDefinition(undefined, editor.signal).then(id => {
            if (id && !editor.signal.aborted) { newDefinition = id; select.value = ""; }
          }).catch((error: unknown) => {
            console.error(error);
            ui.notifications.error("Não foi possível abrir a criação de perícia.");
          }).finally(() => {
            creation = undefined;
            if (!editor.signal.aborted) { refresh(); select.focus(); }
          });
          refresh();
        });
        refresh();
        if (signal.aborted) abort();
      },
      buttons: [{ action: "cancel", label: "Cancelar", callback: () => null }],
      ok: { action: "add", label: "Adicionar", class: "op2-skill-dialog__primary", callback: (_event, button) => {
        if (signal.aborted || creation || !button.form?.reportValidity()) return null;
        const data = new FormData(button.form);
        const selected = options().find(entry => valueOf(entry.selection) === data.get("skill"));
        const die = readSkillDie(Number(data.get("die")));
        return selected && die ? { selection: selected.selection, die } : null;
      } },
    });
    return selected && typeof selected === "object" ? selected : null;
  } finally { editor.abort(); detach?.(); }
}

export function addCustomSkill(actor: foundry.documents.Actor, selection: SkillCheckSelection, die: SkillDieStep, canEdit: () => boolean) {
  if (selection.kind !== "skill" || !isCustomSkillKey(selection.key)) return;
  return updateActorCustomSkill(actor, selection.key, die, "add", canEdit);
}
