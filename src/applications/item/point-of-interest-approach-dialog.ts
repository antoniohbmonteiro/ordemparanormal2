import { SKILL_DEFINITIONS, isSkillKey, type AptitudeSpecializationKey, type SkillKey } from "../../config/skills";
import { isAptitudeSpecializationKey, POINT_OF_INTEREST_DIFFICULTY_MIN,
  type PointOfInterestApproach } from "../../documents/item/point-of-interest-data";
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
): PointOfInterestApproach | null {
  if (!availableSkills.has(draft.skill)) return null;
  const base = { difficulty: POINT_OF_INTEREST_DIFFICULTY_MIN, showDifficultyToPlayers: false };
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

export async function selectPoiApproach(existing: readonly PointOfInterestApproach[]): Promise<PointOfInterestApproach | null> {
  const used = new Set(existing.map(approach => approach.skill === "aptitude"
    ? `aptitude:${approach.specialization}` : approach.skill));
  const unusedSpecializations = APTITUDE_OPTIONS.filter(option => !used.has(`aptitude:${option.value}`));
  const skills = SKILL_DEFINITIONS.filter(definition => definition.key === "aptitude"
    ? unusedSpecializations.length > 0 : !used.has(definition.key));
  if (!skills.length) return null;
  const availableSkills = new Set(skills.map(({ key }) => key));
  let draft: ApproachDraft = { skill: skills[0].key, specialization: null };
  const localize = (key: string) => game.i18n.localize(key);
  const skillOptions = skills.map(({ key, label }) => `<option value="${key}">${label}</option>`).join("");
  return foundry.applications.api.DialogV2.input<PointOfInterestApproach>({
    classes: ["ordemparanormal2"], modal: true, rejectClose: false,
    content: `<div class="op2-poi-approach-dialog"><label>${localize("ORDEMPARANORMAL2.PointOfInterestSheet.Fields.Skill")}<select name="skill">${skillOptions}</select></label>${specializationFieldMarkup(draft.skill, used, localize)}</div>`,
    render: (_event, dialog) => {
      const content = dialog.element.querySelector<HTMLElement>(".op2-poi-approach-dialog");
      const skill = content?.querySelector<HTMLSelectElement>('select[name="skill"]');
      const add = dialog.element.querySelector<HTMLButtonElement>('button[data-action="add"]');
      if (!content || !skill || !add) return;
      const sync = () => { add.disabled = approachFromDraft(draft, used, availableSkills) === null; };
      skill.addEventListener("change", () => {
        if (!isSkillKey(skill.value) || !availableSkills.has(skill.value)) return;
        draft = changeApproachDraftSkill(draft, skill.value);
        content.querySelector("[data-poi-specialization]")?.remove();
        if (draft.skill === "aptitude") {
          content.insertAdjacentHTML("beforeend", specializationFieldMarkup(draft.skill, used, localize));
        }
        sync();
      });
      content.addEventListener("change", event => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement) || target.name !== "specialization") return;
        draft = { ...draft, specialization: isAptitudeSpecializationKey(target.value) ? target.value : null };
        sync();
      });
      sync();
    },
    ok: {
      action: "add", label: "ORDEMPARANORMAL2.PointOfInterestSheet.Actions.AddApproach",
      callback: () => {
        const approach = approachFromDraft(draft, used, availableSkills);
        if (!approach) throw new Error("Invalid POI approach selection.");
        return approach;
      },
    },
    position: { width: 360 },
    window: { title: localize("ORDEMPARANORMAL2.PointOfInterestSheet.SelectApproachTitle") },
  });
}
