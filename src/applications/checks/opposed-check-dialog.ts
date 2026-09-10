import {
  buildAgentCheck,
  parseAgentCheckSelection,
  type AgentCheckSelection,
} from "../../application/checks/build-agent-check";
import {
  areOpposedCheckParticipantReferencesEqual,
  encodeOpposedCheckParticipantReference,
  type OpposedCheckDialogResult,
} from "../../application/checks/opposed-check-configuration";
import {
  listOpposedCheckParticipantCandidates,
  type OpposedCheckParticipantCandidate,
  type OpposedCheckParticipantGroup,
} from "../../adapters/foundry/actors/opposed-check-participant-catalog";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { ensureSharedPartialsLoaded } from "../../adapters/foundry/templates/ensure-shared-partials-loaded";
import { ATTRIBUTE_DEFINITIONS } from "../../config/attributes";
import { SKILL_DEFINITIONS } from "../../config/skills";

const OPPOSED_CHECK_DIALOG_TEMPLATE =
  "systems/ordemparanormal2/templates/checks/opposed-check-dialog.hbs";

type DialogSide = "left" | "right";
type CheckOptionGroup = "attributes" | "skills" | "aptitude";

interface OpposedCheckOption {
  readonly value: string;
  readonly label: string;
}

interface OpposedCheckPreview {
  readonly name: string;
  readonly img: string;
  readonly context: string;
  readonly formula: string;
}

interface OpposedCheckDialogViewModel {
  readonly participantGroups: readonly {
    readonly group: OpposedCheckParticipantGroup;
    readonly label: string;
    readonly options: readonly OpposedCheckOption[];
  }[];
  readonly checkGroups: readonly {
    readonly group: CheckOptionGroup;
    readonly label: string;
    readonly options: readonly OpposedCheckOption[];
  }[];
  readonly hasEnoughParticipants: boolean;
}

const localize = (key: string): string =>
  game.i18n.localize(`ORDEMPARANORMAL2.OpposedCheckDialog.${key}`);

export function encodeAgentCheckSelection(
  selection: AgentCheckSelection,
): string {
  return `${selection.kind}|${selection.key}`;
}

export function parseEncodedAgentCheckSelection(
  value: string,
): AgentCheckSelection {
  const separatorIndex = value.indexOf("|");
  return parseAgentCheckSelection(
    value.slice(0, separatorIndex),
    value.slice(separatorIndex + 1),
  );
}

export function buildOpposedCheckOptions(
  translate: (key: string) => string,
): OpposedCheckDialogViewModel["checkGroups"] {
  const attributes: OpposedCheckOption[] = ATTRIBUTE_DEFINITIONS.map(
    (definition) => ({
      value: encodeAgentCheckSelection({
        kind: "attribute",
        key: definition.key,
      }),
      label: translate(definition.labelKey),
    }),
  );
  const skills: OpposedCheckOption[] = [];
  const aptitude: OpposedCheckOption[] = [];

  for (const definition of SKILL_DEFINITIONS) {
    if ("specializations" in definition) {
      for (const specialization of definition.specializations) {
        aptitude.push({
          value: encodeAgentCheckSelection({
            kind: "aptitude",
            key: specialization.key,
          }),
          label: `${definition.label}: ${specialization.label}`,
        });
      }
      continue;
    }

    skills.push({
      value: encodeAgentCheckSelection({
        kind: "skill",
        key: definition.key,
      }),
      label: definition.label,
    });
  }

  return [
    { group: "attributes", label: localize("Groups.Attributes"), options: attributes },
    { group: "skills", label: localize("Groups.Skills"), options: skills },
    { group: "aptitude", label: localize("Groups.Aptitude"), options: aptitude },
  ];
}

export function buildOpposedCheckPreview(
  candidate: OpposedCheckParticipantCandidate,
  selection: AgentCheckSelection,
  translate: (key: string) => string,
): OpposedCheckPreview {
  const source = readAgentCheckSource(candidate.effectiveActor);
  const check = buildAgentCheck(selection, source, translate);

  return {
    name: candidate.effectiveActor.name,
    img: candidate.img,
    context: check.components.map(({ label }) => label).join(" + "),
    formula: check.components.map(({ die }) => `d${die}`).join(" + "),
  };
}

function buildDialogViewModel(
  candidates: readonly OpposedCheckParticipantCandidate[],
): OpposedCheckDialogViewModel {
  const groups: readonly OpposedCheckParticipantGroup[] = ["scene", "world"];

  return {
    participantGroups: groups
      .map((group) => ({
        group,
        label: localize(group === "scene" ? "Groups.CurrentScene" : "Groups.World"),
        options: candidates
          .filter((candidate) => candidate.group === group)
          .map((candidate) => ({
            value: encodeOpposedCheckParticipantReference(candidate.reference),
            label: candidate.label,
          })),
      }))
      .filter(({ options }) => options.length > 0),
    checkGroups: buildOpposedCheckOptions((key) => game.i18n.localize(key)),
    hasEnoughParticipants: candidates.length >= 2,
  };
}

function readDialogResult(
  button: HTMLButtonElement,
  candidatesByValue: ReadonlyMap<string, OpposedCheckParticipantCandidate>,
): OpposedCheckDialogResult {
  const readSide = (side: DialogSide) => {
    const participantField = button.form?.elements.namedItem(
      `${side}Participant`,
    );
    const checkField = button.form?.elements.namedItem(`${side}Check`);

    if (
      !(participantField instanceof HTMLSelectElement) ||
      !(checkField instanceof HTMLSelectElement)
    ) {
      throw new Error("Missing Opposed Check Dialog fields.");
    }

    const candidate = candidatesByValue.get(participantField.value);
    if (!candidate) throw new Error("Invalid Opposed Check participant.");

    return {
      participant: candidate.reference,
      selection: parseEncodedAgentCheckSelection(checkField.value),
    };
  };
  const left = readSide("left");
  const right = readSide("right");

  if (
    areOpposedCheckParticipantReferencesEqual(
      left.participant,
      right.participant,
    )
  ) {
    throw new Error("Opposed Check participants must be different.");
  }

  return { left, right };
}

function attachDialogControls(
  root: HTMLElement,
  candidatesByValue: ReadonlyMap<string, OpposedCheckParticipantCandidate>,
): void {
  const getParticipantSelect = (side: DialogSide) =>
    root.querySelector<HTMLSelectElement>(
      `[data-participant-select="${side}"]`,
    );
  const getCheckSelect = (side: DialogSide) =>
    root.querySelector<HTMLSelectElement>(`[data-check-select="${side}"]`);
  const createButton = root.querySelector<HTMLButtonElement>(
    '[data-action="createOpposedCheck"]',
  );

  if (
    !getParticipantSelect("left") ||
    !getParticipantSelect("right") ||
    !getCheckSelect("left") ||
    !getCheckSelect("right") ||
    !createButton
  ) {
    throw new Error("Missing Opposed Check Dialog controls.");
  }

  const updateParticipantOptions = (): void => {
    for (const side of ["left", "right"] as const) {
      const select = getParticipantSelect(side) as HTMLSelectElement;
      const opposite = getParticipantSelect(
        side === "left" ? "right" : "left",
      ) as HTMLSelectElement;

      for (const option of select.options) {
        option.disabled = option.value !== "" && option.value === opposite.value;
      }
    }
  };

  const updateSide = (side: DialogSide): void => {
    const participantSelect = getParticipantSelect(side) as HTMLSelectElement;
    const checkSelect = getCheckSelect(side) as HTMLSelectElement;
    const candidate = candidatesByValue.get(participantSelect.value);
    const portrait = root.querySelector<HTMLDivElement>(
      `[data-participant-portrait="${side}"]`,
    );
    const portraitImage = root.querySelector<HTMLImageElement>(
      `[data-participant-portrait-image="${side}"]`,
    );
    const name = root.querySelector<HTMLElement>(
      `[data-participant-name="${side}"]`,
    );
    const context = root.querySelector<HTMLElement>(
      `[data-check-context="${side}"]`,
    );
    const formula = root.querySelector<HTMLElement>(
      `[data-check-formula="${side}"]`,
    );

    if (!portrait || !portraitImage || !name || !context || !formula) {
      throw new Error("Missing Opposed Check preview controls.");
    }

    checkSelect.disabled = !candidate;
    if (!candidate) {
      checkSelect.value = "";
      portraitImage.src = "icons/svg/mystery-man.svg";
      portraitImage.alt = "";
      portrait.setAttribute("aria-label", localize("Preview.NoParticipant"));
      portrait.title = localize("Preview.NoParticipant");
      name.textContent = localize("Preview.NoParticipant");
      context.textContent = localize("Preview.NoCheck");
      formula.textContent = "—";
      return;
    }

    portraitImage.src = candidate.img;
    portraitImage.alt = candidate.effectiveActor.name;
    portrait.setAttribute("aria-label", candidate.effectiveActor.name);
    portrait.title = candidate.effectiveActor.name;
    name.textContent = candidate.effectiveActor.name;
    name.title = candidate.effectiveActor.name;

    if (!checkSelect.value) {
      context.textContent = localize("Preview.NoCheck");
      formula.textContent = "—";
      return;
    }

    const preview = buildOpposedCheckPreview(
      candidate,
      parseEncodedAgentCheckSelection(checkSelect.value),
      (key) => game.i18n.localize(key),
    );
    context.textContent = preview.context;
    context.title = preview.context;
    formula.textContent = preview.formula;
  };

  const updateValidity = (): void => {
    const leftParticipant = getParticipantSelect("left") as HTMLSelectElement;
    const rightParticipant = getParticipantSelect("right") as HTMLSelectElement;
    const leftCheck = getCheckSelect("left") as HTMLSelectElement;
    const rightCheck = getCheckSelect("right") as HTMLSelectElement;
    const leftCandidate = candidatesByValue.get(leftParticipant.value);
    const rightCandidate = candidatesByValue.get(rightParticipant.value);
    const distinct =
      leftCandidate &&
      rightCandidate &&
      !areOpposedCheckParticipantReferencesEqual(
        leftCandidate.reference,
        rightCandidate.reference,
      );

    createButton.disabled = !(
      distinct &&
      leftCheck.value &&
      rightCheck.value
    );
  };

  for (const side of ["left", "right"] as const) {
    const participantSelect = getParticipantSelect(side) as HTMLSelectElement;
    const checkSelect = getCheckSelect(side) as HTMLSelectElement;

    participantSelect.addEventListener("change", () => {
      updateParticipantOptions();
      updateSide(side);
      updateValidity();
    });
    checkSelect.addEventListener("change", () => {
      updateSide(side);
      updateValidity();
    });
    updateSide(side);
  }

  updateParticipantOptions();
  updateValidity();
}

export async function openOpposedCheckDialog(): Promise<OpposedCheckDialogResult | null> {
  await ensureSharedPartialsLoaded();
  const candidates = listOpposedCheckParticipantCandidates();
  const candidatesByValue = new Map(
    candidates.map((candidate) => [
      encodeOpposedCheckParticipantReference(candidate.reference),
      candidate,
    ]),
  );
  const content = await foundry.applications.handlebars.renderTemplate(
    OPPOSED_CHECK_DIALOG_TEMPLATE,
    buildDialogViewModel(candidates),
  );
  const result = await foundry.applications.api.DialogV2.input<
    OpposedCheckDialogResult | "cancel"
  >({
    buttons: [
      {
        action: "cancel",
        label: "ORDEMPARANORMAL2.OpposedCheckDialog.Actions.Cancel",
      },
    ],
    classes: ["ordemparanormal2", "op2-opposed-check-dialog"],
    content,
    modal: true,
    ok: {
      action: "createOpposedCheck",
      label: "ORDEMPARANORMAL2.OpposedCheckDialog.Actions.Create",
      icon: "fa-solid fa-check",
      default: true,
      disabled: true,
      callback: (_event, button) => readDialogResult(button, candidatesByValue),
    },
    position: { width: 600 },
    render: (_event, dialog) => {
      attachDialogControls(dialog.element, candidatesByValue);
    },
    rejectClose: false,
    window: {
      title: localize("Title"),
      resizable: false,
    },
  });

  return result === "cancel" ? null : result;
}
