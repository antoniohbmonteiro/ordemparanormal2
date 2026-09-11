import {
  encodeAgentCheckParticipantReference,
  type AgentCheckParticipantReference,
} from "../../application/checks/agent-check-participant";
import {
  buildAgentCheck,
  parseAgentCheckSelection,
} from "../../application/checks/build-agent-check";
import type { RequestedSkillSelection } from "../../application/checks/check-request-state";
import {
  listAgentCheckParticipantCandidates,
  type AgentCheckParticipantCandidate,
  type AgentCheckParticipantGroup,
} from "../../adapters/foundry/actors/agent-check-participant-catalog";
import { SKILL_DEFINITIONS } from "../../config/skills";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { ensureSharedPartialsLoaded } from "../../adapters/foundry/templates/ensure-shared-partials-loaded";

const TEMPLATE =
  "systems/ordemparanormal2/templates/checks/check-request-dialog.hbs";

export interface CheckRequestDialogResult {
  readonly participant: AgentCheckParticipantReference;
  readonly selection: RequestedSkillSelection;
  readonly difficulty?: number;
}

interface DialogViewModel {
  readonly participantGroups: readonly {
    readonly label: string;
    readonly options: readonly { readonly value: string; readonly label: string }[];
  }[];
  readonly skills: readonly { readonly key: string; readonly label: string }[];
  readonly hasParticipants: boolean;
}

const localize = (key: string): string =>
  game.i18n.localize(`ORDEMPARANORMAL2.CheckRequestDialog.${key}`);

function buildViewModel(
  candidates: readonly AgentCheckParticipantCandidate[],
): DialogViewModel {
  const groups: readonly AgentCheckParticipantGroup[] = ["scene", "world"];
  return {
    participantGroups: groups
      .map((group) => ({
        label: localize(group === "scene" ? "Groups.CurrentScene" : "Groups.World"),
        options: candidates
          .filter((candidate) => candidate.group === group)
          .map((candidate) => ({
            value: encodeAgentCheckParticipantReference(candidate.reference),
            label: candidate.label,
          })),
      }))
      .filter(({ options }) => options.length > 0),
    skills: SKILL_DEFINITIONS.filter(
      (definition) => !("specializations" in definition),
    ).map((definition) => ({ key: definition.key, label: definition.label })),
    hasParticipants: candidates.length > 0,
  };
}

function parseRequestedSkill(value: string): RequestedSkillSelection {
  const selection = parseAgentCheckSelection("skill", value);
  if (selection.kind !== "skill") throw new Error("Invalid requested Skill.");
  return selection;
}

function readDialogResult(
  button: HTMLButtonElement,
  candidatesByValue: ReadonlyMap<string, AgentCheckParticipantCandidate>,
): CheckRequestDialogResult {
  const participantField = button.form?.elements.namedItem("participant");
  const skillField = button.form?.elements.namedItem("skill");
  const difficultyField = button.form?.elements.namedItem("difficulty");
  if (
    !(participantField instanceof HTMLSelectElement) ||
    !(skillField instanceof HTMLSelectElement) ||
    !(difficultyField instanceof HTMLInputElement)
  ) throw new Error("Missing Check Request Dialog fields.");

  const candidate = candidatesByValue.get(participantField.value);
  if (!candidate) throw new Error("Invalid Check Request participant.");
  const selection = parseRequestedSkill(skillField.value);
  if (difficultyField.value.trim() === "") {
    return { participant: candidate.reference, selection };
  }
  const difficulty = difficultyField.valueAsNumber;
  if (!Number.isInteger(difficulty) || difficulty < 1) {
    throw new Error("Check Request difficulty must be a positive integer.");
  }
  return { participant: candidate.reference, selection, difficulty };
}

function attachControls(
  root: HTMLElement,
  candidatesByValue: ReadonlyMap<string, AgentCheckParticipantCandidate>,
): void {
  const participant = root.querySelector<HTMLSelectElement>("[data-participant-select]");
  const skill = root.querySelector<HTMLSelectElement>("[data-skill-select]");
  const difficulty = root.querySelector<HTMLInputElement>("input[name='difficulty']");
  const create = root.querySelector<HTMLButtonElement>("[data-action='createCheckRequest']");
  const actorName = root.querySelector<HTMLElement>("[data-preview-actor]");
  const skillName = root.querySelector<HTMLElement>("[data-preview-skill]");
  const context = root.querySelector<HTMLElement>("[data-preview-context]");
  const portrait = root.querySelector<HTMLElement>("[data-participant-portrait='request']");
  const portraitImage = root.querySelector<HTMLImageElement>("[data-participant-portrait-image='request']");
  if (!participant || !skill || !difficulty || !create || !actorName || !skillName || !context || !portrait || !portraitImage) {
    throw new Error("Missing Check Request Dialog controls.");
  }

  const update = (): void => {
    const candidate = candidatesByValue.get(participant.value);
    skill.disabled = !candidate;
    if (!candidate) skill.value = "";
    const displayedActorName = candidate?.effectiveActor.name ?? localize("Preview.NoParticipant");
    actorName.textContent = displayedActorName;
    actorName.title = displayedActorName;
    portraitImage.src = candidate?.img ?? "icons/svg/mystery-man.svg";
    portraitImage.alt = candidate ? displayedActorName : "";
    portrait.setAttribute("aria-label", displayedActorName);
    portrait.title = displayedActorName;
    const definition = SKILL_DEFINITIONS.find(
      (entry) => !("specializations" in entry) && entry.key === skill.value,
    );
    if (candidate && definition) {
      const check = buildAgentCheck(
        parseRequestedSkill(definition.key),
        readAgentCheckSource(candidate.effectiveActor),
        (key) => game.i18n.localize(key),
      );
      skillName.textContent = check.check.name;
      context.textContent = check.components.map(({ label }) => label).join(" + ");
    } else {
      skillName.textContent = localize("Preview.NoSkill");
      context.textContent = "—";
    }
    const validDifficulty =
      difficulty.value.trim() === "" ||
      (Number.isInteger(difficulty.valueAsNumber) && difficulty.valueAsNumber >= 1);
    create.disabled = !candidate || !definition || !validDifficulty;
  };
  participant.addEventListener("change", update);
  skill.addEventListener("change", update);
  difficulty.addEventListener("input", update);
  update();
}

export async function openCheckRequestDialog(): Promise<CheckRequestDialogResult | null> {
  await ensureSharedPartialsLoaded();
  const candidates = listAgentCheckParticipantCandidates();
  const candidatesByValue = new Map(
    candidates.map((candidate) => [
      encodeAgentCheckParticipantReference(candidate.reference),
      candidate,
    ]),
  );
  const content = await foundry.applications.handlebars.renderTemplate(
    TEMPLATE,
    buildViewModel(candidates),
  );
  const result = await foundry.applications.api.DialogV2.input<
    CheckRequestDialogResult | "cancel"
  >({
    buttons: [{ action: "cancel", label: "ORDEMPARANORMAL2.CheckRequestDialog.Actions.Cancel" }],
    classes: ["ordemparanormal2", "op2-check-request-dialog"],
    content,
    modal: true,
    ok: {
      action: "createCheckRequest",
      label: "ORDEMPARANORMAL2.CheckRequestDialog.Actions.Create",
      icon: "fa-solid fa-paper-plane",
      default: true,
      disabled: true,
      callback: (_event, button) => readDialogResult(button, candidatesByValue),
    },
    position: { width: 480 },
    render: (_event, dialog) => attachControls(dialog.element, candidatesByValue),
    rejectClose: false,
    window: { title: localize("Title"), resizable: false },
  });
  return result === "cancel" ? null : result;
}
