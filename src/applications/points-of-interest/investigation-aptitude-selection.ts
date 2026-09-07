import {
  SKILL_DEFINITIONS,
  type AptitudeSpecializationKey,
} from "../../config/skills";

const LOCALIZATION_ROOT = "ORDEMPARANORMAL2.PointOfInterest.Investigation";

const aptitude = SKILL_DEFINITIONS.find(
  (definition) => definition.key === "aptitude",
);

if (!aptitude || !("specializations" in aptitude)) {
  throw new Error("Missing canonical Aptitude specializations.");
}

const specializations = aptitude.specializations;

/** Opens the small prerequisite choice used before the regular Check Dialog. */
export async function selectInvestigationAptitudeSpecialization(): Promise<
  AptitudeSpecializationKey | null
> {
  const options = specializations
    .map(({ key, label }) => `<option value="${key}">${label}</option>`)
    .join("");
  const result = await foundry.applications.api.DialogV2.input<
    AptitudeSpecializationKey | "cancel"
  >({
    buttons: [{
      action: "cancel",
      label: `${LOCALIZATION_ROOT}.Aptitude.Cancel`,
    }],
    classes: ["ordemparanormal2"],
    content: `<label>${game.i18n.localize(`${LOCALIZATION_ROOT}.Aptitude.Specialization`)}<select name="specialization">${options}</select></label>`,
    modal: true,
    ok: {
      action: "select",
      label: `${LOCALIZATION_ROOT}.Aptitude.Select`,
      default: true,
      callback: (_event, button) => {
        const field = button.form?.elements.namedItem("specialization");
        if (!(field instanceof HTMLSelectElement)) {
          throw new Error("Missing Aptitude specialization selection.");
        }
        const selected = specializations.find(({ key }) => key === field.value);
        if (!selected) throw new Error("Invalid Aptitude specialization selection.");
        return selected.key;
      },
    },
    position: { width: 360 },
    rejectClose: false,
    window: {
      title: game.i18n.localize(`${LOCALIZATION_ROOT}.Aptitude.Title`),
      resizable: false,
    },
  });

  return result === "cancel" ? null : result;
}
