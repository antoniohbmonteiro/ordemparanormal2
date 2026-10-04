import { SKILL_DEFINITIONS, isSkillKey, type AptitudeSpecializationKey, type SkillKey } from "../../config/skills";
import { approachIdentity, isSkillApproach, isAptitudeSpecializationKey, POINT_OF_INTEREST_DIFFICULTY_MIN,
  isToolApproach, type PointOfInterestInformation,
  type PointOfInterestApproach, type PointOfInterestSkillApproach } from "../../documents/item/point-of-interest-data";
import { loadToolSources, describeToolApproach } from "../../adapters/foundry/equipment/equipment-source";
import { APTITUDE_OPTIONS } from "./point-of-interest-information-editor";

interface ApproachDraft {
  readonly skill: SkillKey;
  readonly specialization: AptitudeSpecializationKey | null;
}

export function changeApproachDraftSkill(draft: ApproachDraft, skill: SkillKey): ApproachDraft {
  return { skill, specialization: skill === "aptitude" && draft.skill === "aptitude" ? draft.specialization : null };
}

export function approachFromDraft(
  draft: ApproachDraft, used: ReadonlySet<string>, availableSkills: ReadonlySet<SkillKey>,
): PointOfInterestSkillApproach | null {
  if (!availableSkills.has(draft.skill)) return null;
  const base = { difficulty: POINT_OF_INTEREST_DIFFICULTY_MIN, showDifficultyToPlayers: true };
  if (draft.skill === "aptitude") {
    if (!isAptitudeSpecializationKey(draft.specialization)
      || used.has(`aptitude:${draft.specialization}`)) return null;
    return { ...base, skill: "aptitude", specialization: draft.specialization };
  }
  return used.has(draft.skill) ? null : { ...base, skill: draft.skill };
}

export function specializationFieldMarkup(
  skill: SkillKey, used: ReadonlySet<string>, localize: (key: string) => string,
): string {
  if (skill !== "aptitude") return "";
  const options = APTITUDE_OPTIONS.filter(option => !used.has(`aptitude:${option.value}`))
    .map(({ value, label }) => `<option value="${value}">${label}</option>`).join("");
  return `<label data-poi-specialization>${localize("ORDEMPARANORMAL2.PointOfInterestSheet.Fields.Specialization")}<select name="specialization" required><option value="" selected disabled>${localize("ORDEMPARANORMAL2.PointOfInterestSheet.ChooseSpecialization")}</option>${options}</select></label>`;
}

export async function selectPoiApproach(existing: readonly PointOfInterestApproach[],
  initial?: PointOfInterestApproach, information: readonly PointOfInterestInformation[] = []): Promise<PointOfInterestApproach | null> {
  const used = new Set(existing.map(approachIdentity));
  const sources = await loadToolSources();
  const unusedSpecializations = APTITUDE_OPTIONS.filter(option => !used.has(`aptitude:${option.value}`));
  const skills = SKILL_DEFINITIONS.filter(definition => definition.key === "aptitude"
    ? unusedSpecializations.length > 0 : !used.has(definition.key));
  if (!skills.length && !sources.length) return null;
  const availableSkills = new Set(skills.map(({ key }) => key));
  let draft: ApproachDraft = initial && isSkillApproach(initial)
    ? { skill: initial.skill, specialization: initial.skill === "aptitude" ? initial.specialization : null }
    : { skill: skills[0]?.key ?? "acrobatics", specialization: null };
  let kind: "skill" | "tool" = initial?.type === "tool" || !skills.length ? "tool" : "skill";
  let equipmentUuid = initial?.equipmentUuid ?? "";
  let useFormId = initial?.useFormId ?? "";
  let length: 4 | 5 | 6 | null = initial?.mechanicConfig?.sequenceLength ?? null;
  const currentForm = () => sources.find(source => source.uuid === equipmentUuid)?.forms.find(form => form.id === useFormId);
  const sharedApproaches = () => information.flatMap(entry => entry.approaches.filter(isToolApproach))
    .filter(approach => approach.equipmentUuid === equipmentUuid && approach.useFormId === useFormId);
  const reuseLength = () => {
    const shared = sharedApproaches();
    length = shared.length && shared.every(approach => approach.mechanicConfig?.sequenceLength === shared[0]?.mechanicConfig?.sequenceLength)
      ? shared[0]?.mechanicConfig?.sequenceLength ?? null : null;
  };
  const localize = (key: string) => game.i18n.localize(key);
  const skillOptions = skills.map(({ key, label }) => `<option value="${key}"${key === draft.skill ? " selected" : ""}>${label}</option>`).join("");
  const toolOptions = sources.map(source => `<option value="${foundry.utils.escapeHTML(source.uuid)}"${source.uuid === equipmentUuid ? " selected" : ""}>${foundry.utils.escapeHTML(`${source.name} — ${source.origin}`)}</option>`).join("");
  const resolve = (): PointOfInterestApproach | null => {
    if (kind === "tool") {
      if (!sources.some(source => source.uuid === equipmentUuid && source.forms.some(form => form.id === useFormId))) return null;
      if (currentForm()?.mechanic === "laboratory" && length === null) return null;
      const approach = { type: "tool" as const, equipmentUuid, useFormId,
        ...(currentForm()?.mechanic === "laboratory" && length !== null
          ? { mechanicConfig: { type: "laboratory" as const, sequenceLength: length } } : {}) };
      return used.has(approachIdentity(approach)) ? null : approach;
    }
    const approach = approachFromDraft(draft, used, availableSkills);
    return approach && initial && isSkillApproach(initial) ? { ...approach, difficulty: initial.difficulty,
      showDifficultyToPlayers: initial.showDifficultyToPlayers,
      ...(initial.difficultyOverride ? { difficultyOverride: { ...initial.difficultyOverride } } : {}) } : approach;
  };
  return foundry.applications.api.DialogV2.input<PointOfInterestApproach | null>({
    classes: ["ordemparanormal2"], modal: true, rejectClose: false,
    content: `<div class="op2-poi-approach-dialog"><label>${localize("ORDEMPARANORMAL2.EquipmentUse.ApproachType")}<select name="approachType"><option value="skill"${kind === "skill" ? " selected" : ""}>${localize("ORDEMPARANORMAL2.PointOfInterestSheet.Fields.Skill")}</option><option value="tool"${kind === "tool" ? " selected" : ""}>${localize("ORDEMPARANORMAL2.EquipmentUse.Tool")}</option></select></label><fieldset data-skill-fields><label>${localize("ORDEMPARANORMAL2.PointOfInterestSheet.Fields.Skill")}<select name="skill">${skillOptions}</select></label>${specializationFieldMarkup(draft.skill, used, localize)}</fieldset><fieldset data-tool-fields><label>${localize("ORDEMPARANORMAL2.EquipmentUse.Tool")}<select name="equipmentUuid"><option value="" disabled selected>—</option>${toolOptions}</select></label><label>${localize("ORDEMPARANORMAL2.EquipmentUse.SelectForm")}<select name="useFormId"></select></label></fieldset></div>`,
    render: (_event, dialog) => {
      const content = dialog.element.querySelector<HTMLElement>(".op2-poi-approach-dialog");
      const skill = content?.querySelector<HTMLSelectElement>('select[name="skill"]');
      const add = dialog.element.querySelector<HTMLButtonElement>('button[data-action="add"]');
      if (!content || !skill || !add) return;
      const sync = () => {
        const lengthField = content.querySelector<HTMLElement>("[data-laboratory-length]");
        const lengthSelect = lengthField?.querySelector<HTMLSelectElement>("select");
        if (lengthField) lengthField.hidden = kind !== "tool" || currentForm()?.mechanic !== "laboratory";
        if (lengthSelect) lengthSelect.value = length === null ? "" : String(length);
        add.disabled = resolve() === null;
        const skillFields = content.querySelector<HTMLElement>("[data-skill-fields]");
        const toolFields = content.querySelector<HTMLElement>("[data-tool-fields]");
        if (skillFields) skillFields.hidden = kind !== "skill";
        if (toolFields) toolFields.hidden = kind !== "tool";
      };
      content.querySelector("[data-tool-fields]")?.insertAdjacentHTML("beforeend",
        `<label data-laboratory-length>${localize("ORDEMPARANORMAL2.Laboratory.Length")}<select name="sequenceLength"><option value="" disabled selected>—</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></label>`);
      const formSelect = content.querySelector<HTMLSelectElement>('select[name="useFormId"]');
      const refreshForms = () => {
        if (!formSelect) return;
        const forms = sources.find(source => source.uuid === equipmentUuid)?.forms ?? [];
        formSelect.innerHTML = `<option value="" disabled${useFormId ? "" : " selected"}>—</option>` + forms.filter(form =>
          !used.has(approachIdentity({ type: "tool", equipmentUuid, useFormId: form.id })))
          .map(form => `<option value="${foundry.utils.escapeHTML(form.id)}"${form.id === useFormId ? " selected" : ""}>${foundry.utils.escapeHTML(form.name)}</option>`).join("");
      };
      refreshForms();
      const equipmentSelect = content.querySelector<HTMLSelectElement>('select[name="equipmentUuid"]');
      if (equipmentSelect) equipmentSelect.value = equipmentUuid;
      const specialization = content.querySelector<HTMLSelectElement>('select[name="specialization"]');
      if (specialization && draft.specialization) specialization.value = draft.specialization;
      skill.addEventListener("change", () => {
        if (!isSkillKey(skill.value) || !availableSkills.has(skill.value)) return;
        draft = changeApproachDraftSkill(draft, skill.value);
        content.querySelector("[data-poi-specialization]")?.remove();
        if (draft.skill === "aptitude") {
          (content.querySelector<HTMLElement>("[data-skill-fields]") ?? content)
            .insertAdjacentHTML("beforeend", specializationFieldMarkup(draft.skill, used, localize));
        }
        sync();
      });
      content.addEventListener("change", event => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        if (target.name === "approachType") { kind = target.value === "tool" ? "tool" : "skill"; sync(); return; }
        if (target.name === "equipmentUuid") { equipmentUuid = target.value; useFormId = ""; length = null; refreshForms(); sync(); return; }
        if (target.name === "useFormId") { useFormId = target.value; reuseLength(); sync(); return; }
        if (target.name === "sequenceLength") { const value = Number(target.value); length = value === 4 || value === 5 || value === 6 ? value : null; sync(); return; }
        if (target.name !== "specialization") return;
        draft = { ...draft, specialization: isAptitudeSpecializationKey(target.value) ? target.value : null };
        sync();
      });
      sync();
    },
    ok: {
      action: "add", label: "ORDEMPARANORMAL2.PointOfInterestSheet.Actions.AddApproach",
      callback: async () => {
        const approach = resolve();
        if (!approach) throw new Error("Invalid POI approach selection.");
        if (approach.type === "tool" && !(await describeToolApproach(approach.equipmentUuid, approach.useFormId, approach.mechanicConfig)).valid)
          throw new Error("The selected tool source or use form is no longer available.");
        if (isToolApproach(approach) && sharedApproaches().some(existing =>
          JSON.stringify(existing.mechanicConfig ?? null) !== JSON.stringify(approach.mechanicConfig ?? null))) {
          const confirmed = await foundry.applications.api.DialogV2.confirm({ modal: true, rejectClose: false,
            window: { title: localize("ORDEMPARANORMAL2.Laboratory.Length") },
            content: `<p>${localize("ORDEMPARANORMAL2.Laboratory.ConfirmSharedLength")}</p>` });
          if (!confirmed) return null;
        }
        return approach;
      },
    },
    position: { width: 360 },
    window: { title: localize("ORDEMPARANORMAL2.PointOfInterestSheet.SelectApproachTitle") },
  });
}
