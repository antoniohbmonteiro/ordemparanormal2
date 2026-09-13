import type {
  CheckExtraDieInput,
  CheckInput,
  CheckStepAdjustments,
} from "../../core/checks/check";
import type { AttributeKey } from "../../core/actors/agent-attributes";
import {
  adjustDieStep,
  isDieStep,
  type DieStep,
  NORMAL_DIE_STEPS,
  type NormalDieStep,
} from "../../core/dice/die-step";
import {
  resolveCheckAbilityUseState,
  toggleCheckAbilityUse,
  type AgentCheckAbilitySource,
  type AppliedCheckAbilityUse,
  type CheckAbilityUseOption,
  type CheckAbilityUseReference,
} from "../../application/checks/check-ability-use-state";
import { localizeAbilityCost } from "../../ui/abilities/ability-cost-label";

const CHECK_DIALOG_TEMPLATE =
  "systems/ordemparanormal2/templates/checks/check-dialog.hbs";
const CHECK_ABILITY_USE_PICKER_TEMPLATE =
  "systems/ordemparanormal2/templates/checks/check-ability-use-picker.hbs";

export interface CheckDialogResult {
  readonly difficulty?: number;
  readonly selectedAttribute?: AttributeKey;
  readonly stepAdjustments: CheckStepAdjustments;
  readonly extraDice: readonly CheckExtraDieInput[];
  readonly abilityUses: readonly CheckAbilityUseReference[];
}

export interface CheckDialogAttributeChoice {
  readonly key: AttributeKey;
  readonly label: string;
  readonly die: DieStep;
}

export interface CheckDialogOptions {
  readonly attributeChoices?: readonly CheckDialogAttributeChoice[];
  readonly allowDifficulty?: boolean;
  readonly lockedDifficulty?: number;
  readonly abilitySource?: AgentCheckAbilitySource;
}

const MIN_STEP_ADJUSTMENT = -4;
const MAX_STEP_ADJUSTMENT = 4;

interface CheckDialogViewModel {
  readonly name: string;
  readonly allowDifficulty: boolean;
  readonly difficulty?: number;
  readonly isDifficultyLocked: boolean;
  readonly components: readonly {
    readonly key: string;
    readonly label: string;
    readonly die: DieStep;
    readonly dieLabel: string;
    readonly attributeChoices?: readonly {
      readonly key: AttributeKey;
      readonly label: string;
      readonly selected: boolean;
    }[];
  }[];
  readonly diceOptions: readonly {
    readonly die: NormalDieStep;
    readonly label: string;
  }[];
  readonly hasCheckAbilities: boolean;
}

function buildCheckDialogViewModel(
  input: CheckInput,
  options?: CheckDialogOptions,
): CheckDialogViewModel {
  const lockedDifficulty = options?.lockedDifficulty;
  if (
    lockedDifficulty !== undefined &&
    (!Number.isInteger(lockedDifficulty) || lockedDifficulty < 1)
  ) {
    throw new Error("Locked check difficulty must be a positive integer.");
  }
  if (lockedDifficulty !== undefined && options?.allowDifficulty === false) {
    throw new Error("A locked check difficulty cannot be hidden.");
  }

  return {
    name: input.check.name,
    allowDifficulty: options?.allowDifficulty !== false,
    ...(lockedDifficulty !== undefined ? { difficulty: lockedDifficulty } : {}),
    isDifficultyLocked: lockedDifficulty !== undefined,
    components: input.components.map((component) => ({
      key: component.key,
      label: component.label,
      die: component.die,
      dieLabel: `d${component.die}`,
      ...(component.kind === "attribute" && options?.attributeChoices
        ? {
            attributeChoices: options.attributeChoices.map((choice) => ({
              key: choice.key,
              label: choice.label,
              selected: choice.key === component.key,
            })),
          }
        : {}),
    })),
    diceOptions: NORMAL_DIE_STEPS.map((die) => ({ die, label: `d${die}` })),
    hasCheckAbilities: options?.abilitySource?.abilities.some((ability) =>
      ability.uses.some(({ checkIntegration }) => checkIntegration !== null),
    ) ?? false,
  };
}

function validateAttributeChoices(
  input: CheckInput,
  attributeChoices: readonly CheckDialogAttributeChoice[] | undefined,
): void {
  if (!attributeChoices) return;

  if (input.check.kind === "attribute") {
    throw new Error("Attribute checks cannot offer alternate attributes.");
  }

  const attributeComponent = input.components.find(
    ({ kind }) => kind === "attribute",
  );
  const choiceKeys = attributeChoices.map(({ key }) => key);

  if (
    !attributeComponent ||
    attributeChoices.length === 0 ||
    new Set(choiceKeys).size !== choiceKeys.length ||
    !attributeChoices.some(({ key }) => key === attributeComponent.key)
  ) {
    throw new Error("Invalid alternate attribute choices.");
  }
}

interface StepAdjustmentController {
  setBaseDie(die: DieStep, label: string): void;
}

function attachStepAdjustmentControls(
  root: HTMLElement,
): ReadonlyMap<string, StepAdjustmentController> {
  const controls = root.querySelectorAll<HTMLElement>(
    "[data-step-adjustment-control]",
  );

  if (controls.length === 0) {
    throw new Error("Missing check step adjustment controls.");
  }

  const controllers = new Map<string, StepAdjustmentController>();

  for (const control of controls) {
    const componentKey = control.dataset.componentKey;
    const initialBaseDie = Number(control.dataset.baseDie);
    const field = control.querySelector<HTMLInputElement>(
      'input[type="number"]',
    );
    const decrease = control.querySelector<HTMLButtonElement>(
      "[data-step-adjustment-decrease]",
    );
    const increase = control.querySelector<HTMLButtonElement>(
      "[data-step-adjustment-increase]",
    );
    const effectiveDieLabel = control.querySelector<HTMLElement>(
      "[data-effective-die]",
    );
    const baseDieLabel = control.querySelector<HTMLElement>(
      "[data-base-die-label]",
    );

    if (
      !isDieStep(initialBaseDie) ||
      !componentKey ||
      !field ||
      !decrease ||
      !increase ||
      !effectiveDieLabel ||
      !baseDieLabel
    ) {
      throw new Error("Missing check step adjustment controls.");
    }

    let baseDie: DieStep = initialBaseDie;
    let currentAdjustment = 0;
    const update = (adjustment: number): void => {
      const effectiveDie = adjustDieStep(baseDie, adjustment);
      currentAdjustment = adjustment;
      field.value = String(currentAdjustment);
      effectiveDieLabel.textContent = `d${effectiveDie}`;
      baseDieLabel.hidden = effectiveDie === baseDie;

      if (effectiveDie > baseDie) {
        effectiveDieLabel.dataset.adjustmentDirection = "increased";
      } else if (effectiveDie < baseDie) {
        effectiveDieLabel.dataset.adjustmentDirection = "decreased";
      } else {
        delete effectiveDieLabel.dataset.adjustmentDirection;
      }

      decrease.disabled = baseDie === 20 || effectiveDie === 4;
      increase.disabled = baseDie === 20 || effectiveDie === 12;
    };

    decrease.addEventListener("click", () => {
      if (!decrease.disabled) update(currentAdjustment - 1);
    });
    increase.addEventListener("click", () => {
      if (!increase.disabled) update(currentAdjustment + 1);
    });

    update(0);
    controllers.set(componentKey, {
      setBaseDie: (die, label) => {
        baseDie = die;
        control.dataset.baseDie = String(die);
        control.setAttribute(
          "aria-label",
          `${game.i18n.localize(
            "ORDEMPARANORMAL2.CheckDialog.Fields.StepAdjustment",
          )}: ${label}`,
        );
        baseDieLabel.textContent = `(d${die})`;
        update(currentAdjustment);
      },
    });
  }

  return controllers;
}

function attachAttributeSelectionControl(
  root: HTMLElement,
  initialAttributeKey: string,
  attributeChoices: readonly CheckDialogAttributeChoice[],
  controllers: ReadonlyMap<string, StepAdjustmentController>,
  onChange: (key: AttributeKey) => void = () => undefined,
): void {
  const select = root.querySelector<HTMLSelectElement>(
    "[data-attribute-select]",
  );
  const controller = controllers.get(initialAttributeKey);

  if (!select || !controller) {
    throw new Error("Missing alternate attribute controls.");
  }

  const update = (): void => {
    const choice = attributeChoices.find(({ key }) => key === select.value);

    if (!choice) {
      throw new Error("Invalid selected check attribute.");
    }

    controller.setBaseDie(choice.die, choice.label);
    onChange(choice.key);
  };

  select.addEventListener("change", update);
  update();
}

function isNormalDieStep(value: number): value is NormalDieStep {
  return NORMAL_DIE_STEPS.some((die) => die === value);
}

function attachSituationalDiceControls(
  root: HTMLElement,
  componentCount: number,
  extraDice: CheckExtraDieInput[],
  situationalLabel: string,
  removeLabel: string,
  getAbilityDieCount: () => number = () => 0,
  onChange: () => void = () => undefined,
): { readonly refresh: () => void } {
  const addButtons = root.querySelectorAll<HTMLButtonElement>(
    "[data-extra-die-add]",
  );
  const counter = root.querySelector<HTMLElement>("[data-dice-count]");
  const addedSection = root.querySelector<HTMLElement>(
    "[data-extra-dice-added]",
  );
  const chipList = root.querySelector<HTMLElement>("[data-extra-dice-list]");

  if (addButtons.length !== NORMAL_DIE_STEPS.length || !counter || !addedSection || !chipList) {
    throw new Error("Missing situational extra die controls.");
  }

  let nextExtraDieId = 1;

  const update = (): void => {
    const dieCount = componentCount + extraDice.length + getAbilityDieCount();
    const atLimit = dieCount >= 4;
    counter.textContent = `${dieCount} / 4`;
    counter.dataset.atLimit = String(atLimit);
    addedSection.hidden = extraDice.length === 0 && getAbilityDieCount() === 0;

    for (const button of addButtons) button.disabled = atLimit;
  };

  const addChip = (extraDie: CheckExtraDieInput): void => {
    const chip = root.ownerDocument.createElement("li");
    const icon = root.ownerDocument.createElement("span");
    const label = root.ownerDocument.createElement("strong");
    const remove = root.ownerDocument.createElement("button");

    chip.className = "op2-check-dialog__extra-die-chip";
    chip.dataset.extraDieId = extraDie.id;
    icon.className = `op2-die-icon op2-die-icon--d${extraDie.die}`;
    icon.setAttribute("aria-hidden", "true");
    label.textContent = `d${extraDie.die}`;
    remove.type = "button";
    remove.className = "op2-check-dialog__remove-extra-die";
    remove.dataset.extraDieRemove = extraDie.id;
    remove.setAttribute("aria-label", `${removeLabel}: d${extraDie.die}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const index = extraDice.findIndex(({ id }) => id === extraDie.id);

      if (index < 0) return;

      extraDice.splice(index, 1);
      chip.remove();
      update();
      onChange();
    });

    chip.append(icon, label, remove);
    chipList.append(chip);
  };

  for (const button of addButtons) {
    button.addEventListener("click", () => {
      if (button.disabled || componentCount + extraDice.length + getAbilityDieCount() >= 4) return;

      const die = Number(button.dataset.extraDieAdd);

      if (!isNormalDieStep(die)) {
        throw new Error("Invalid situational extra die step.");
      }

      const extraDie: CheckExtraDieInput = {
        id: `situational-${nextExtraDieId}`,
        die,
        source: "situational",
        label: situationalLabel,
      };
      nextExtraDieId += 1;
      extraDice.push(extraDie);
      addChip(extraDie);
      update();
      onChange();
    });
  }

  update();
  return { refresh: update };
}

function withSelectedAttribute(input: CheckInput, key: AttributeKey): CheckInput {
  return {
    ...input,
    components: input.components.map((component) => component.kind === "attribute"
      ? { ...component, key }
      : component),
  };
}

interface CheckAbilityPickerOption {
  readonly abilityId: string;
  readonly useId: string;
  readonly abilityName: string;
  readonly useName: string;
  readonly costLabel: string;
  readonly effectLabel: string;
  readonly die: NormalDieStep;
}

function buildAbilityPickerOptions(
  options: readonly CheckAbilityUseOption[],
): readonly CheckAbilityPickerOption[] {
  return options.map((option) => ({
    abilityId: option.abilityId,
    useId: option.useId,
    abilityName: option.abilityName,
    useName: option.useName,
    costLabel: localizeAbilityCost(option.cost),
    effectLabel: `d${option.die}`,
    die: option.die,
  }));
}

async function openCheckAbilityUsePicker(
  options: readonly CheckAbilityUseOption[],
): Promise<CheckAbilityUseReference | null> {
  const content = await foundry.applications.handlebars.renderTemplate(
    CHECK_ABILITY_USE_PICKER_TEMPLATE,
    { options: buildAbilityPickerOptions(options) },
  );
  const { DialogV2 } = foundry.applications.api;
  let picked: CheckAbilityUseReference | null = null;
  await DialogV2.wait({
    buttons: [{
      action: "cancel",
      label: "ORDEMPARANORMAL2.CheckDialog.Actions.Cancel",
      type: "button",
      default: true,
    }],
    classes: ["ordemparanormal2", "op2-check-ability-picker"],
    content,
    modal: true,
    rejectClose: false,
    render: (_event, dialog) => {
      const buttons = dialog.element.querySelectorAll<HTMLButtonElement>("[data-use-id]");
      for (const button of buttons) {
        button.addEventListener("click", () => {
          const abilityId = button.dataset.abilityId;
          const useId = button.dataset.useId;
          if (!abilityId || !useId) return;
          picked = { abilityId, useId };
          void dialog.close();
        });
      }
    },
    position: { width: 420 },
    window: { title: game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Abilities.PickerTitle") },
  });
  return picked;
}

function abilityDieOriginTooltip(applied: AppliedCheckAbilityUse): string {
  return [
    game.i18n.format("ORDEMPARANORMAL2.CheckDialog.Abilities.OriginAddedBy", { ability: applied.abilityName }),
    game.i18n.format("ORDEMPARANORMAL2.CheckDialog.Abilities.OriginForm", { use: applied.useName }),
    game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Abilities.OriginRemoveHint"),
  ].join("\n");
}

function renderAbilityDiceChips(
  root: HTMLElement,
  chipList: HTMLElement,
  applied: readonly AppliedCheckAbilityUse[],
): void {
  for (const stale of [...chipList.querySelectorAll<HTMLElement>("[data-ability-die-id]")]) {
    stale.remove();
  }
  for (const entry of applied) {
    const chip = root.ownerDocument.createElement("li");
    const dieValue = root.ownerDocument.createElement("span");
    const icon = root.ownerDocument.createElement("span");
    const label = root.ownerDocument.createElement("strong");
    const tag = root.ownerDocument.createElement("span");

    chip.className = "op2-check-dialog__extra-die-chip op2-check-dialog__extra-die-chip--ability";
    chip.dataset.abilityDieId = entry.extraDieId;
    chip.title = abilityDieOriginTooltip(entry);
    dieValue.className = "op2-check-dialog__ability-die-value";
    icon.className = `op2-die-icon op2-die-icon--d${entry.die}`;
    icon.setAttribute("aria-hidden", "true");
    label.textContent = `d${entry.die}`;
    tag.className = "op2-check-dialog__ability-die-tag";
    tag.textContent = `✦ ${entry.abilityName}`;

    dieValue.append(icon, label);
    chip.append(dieValue, tag);
    chipList.append(chip);
  }
}

function buildAbilityCard(
  root: HTMLElement,
  applied: AppliedCheckAbilityUse,
  onRemove: () => void,
): HTMLElement {
  const card = root.ownerDocument.createElement("li");
  const header = root.ownerDocument.createElement("div");
  const name = root.ownerDocument.createElement("strong");
  const remove = root.ownerDocument.createElement("button");
  const costRow = root.ownerDocument.createElement("div");
  const costLabel = root.ownerDocument.createElement("span");
  const costValue = root.ownerDocument.createElement("span");
  const effectRow = root.ownerDocument.createElement("div");
  const effectLabel = root.ownerDocument.createElement("span");
  const effectValue = root.ownerDocument.createElement("span");
  const effectIcon = root.ownerDocument.createElement("span");
  const effectDie = root.ownerDocument.createElement("span");

  card.className = "op2-check-dialog__ability-card";

  header.className = "op2-check-dialog__ability-card-header";
  name.textContent = applied.abilityName;
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute(
    "aria-label",
    `${game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Abilities.Remove")}: ${applied.abilityName}`,
  );
  remove.addEventListener("click", onRemove);
  header.append(name, remove);

  costRow.className = "op2-check-dialog__ability-card-row";
  costLabel.textContent = game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Abilities.Cost");
  costValue.className = "op2-check-dialog__ability-card-value";
  costValue.textContent = localizeAbilityCost(applied.cost);
  costRow.append(costLabel, costValue);

  effectRow.className = "op2-check-dialog__ability-card-row";
  effectLabel.textContent = game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Abilities.Effect");
  effectValue.className = "op2-check-dialog__ability-card-value";
  effectIcon.className = `op2-die-icon op2-die-icon--d${applied.die}`;
  effectIcon.setAttribute("aria-hidden", "true");
  effectDie.textContent = `d${applied.die}`;
  effectValue.append(effectIcon, effectDie);
  effectRow.append(effectLabel, effectValue);

  card.append(header, costRow, effectRow);
  return card;
}

function attachAbilityUseControls(
  root: HTMLElement,
  input: CheckInput,
  source: AgentCheckAbilitySource,
  situationalDice: readonly CheckExtraDieInput[],
  selected: CheckAbilityUseReference[],
  getAttribute: () => AttributeKey,
  onChange: () => void,
): { readonly refresh: () => void; readonly count: () => number } {
  const section = root.querySelector<HTMLElement>("[data-check-abilities]");
  const countLabel = root.querySelector<HTMLElement>("[data-check-ability-count]");
  const addButton = root.querySelector<HTMLButtonElement>("[data-check-ability-add]");
  const selectedRoot = root.querySelector<HTMLElement>("[data-check-ability-selected]");
  const chipList = root.querySelector<HTMLElement>("[data-extra-dice-list]");
  if (!section || !countLabel || !addButton || !selectedRoot || !chipList) {
    throw new Error("Missing applicable Ability controls.");
  }

  const currentCheck = (): CheckInput => withSelectedAttribute(input, getAttribute());
  let state = resolveCheckAbilityUseState({ check: currentCheck(), source, situationalDice, selected });

  const refresh = (): void => {
    state = resolveCheckAbilityUseState({ check: currentCheck(), source, situationalDice, selected });
    selected.splice(0, selected.length, ...state.selected);
    section.hidden = state.options.length === 0;

    const selectable = state.options.filter((option) => option.available && !option.selected);
    countLabel.textContent = String(selectable.length);
    addButton.disabled = selectable.length === 0;

    selectedRoot.replaceChildren();
    for (const applied of state.applied) {
      selectedRoot.append(buildAbilityCard(root, applied, () => applyReference(applied)));
    }

    renderAbilityDiceChips(root, chipList, state.applied);
  };

  const applyReference = (reference: CheckAbilityUseReference): void => {
    state = toggleCheckAbilityUse({ check: currentCheck(), source, situationalDice, selected }, reference);
    selected.splice(0, selected.length, ...state.selected);
    refresh();
    onChange();
  };

  addButton.addEventListener("click", () => {
    if (addButton.disabled) return;
    const selectable = state.options.filter((option) => option.available && !option.selected);
    if (selectable.length === 0) return;
    return openCheckAbilityUsePicker(selectable).then((reference) => {
      if (reference) applyReference(reference);
    });
  });

  refresh();
  return { refresh, count: () => state.selected.length };
}

function readDialogResult(
  button: HTMLButtonElement,
  components: CheckInput["components"],
  extraDice: readonly CheckExtraDieInput[],
  abilityUses: readonly CheckAbilityUseReference[],
  attributeChoices?: readonly CheckDialogAttributeChoice[],
  allowDifficulty = true,
  lockedDifficulty?: number,
): CheckDialogResult {
  const difficultyField = button.form?.elements.namedItem("difficulty");

  if (allowDifficulty && !(difficultyField instanceof HTMLInputElement)) {
    throw new Error("Missing check difficulty field.");
  }

  let selectedAttribute: AttributeKey | undefined;

  if (attributeChoices) {
    const selectedAttributeField = button.form?.elements.namedItem(
      "selectedAttribute",
    );

    if (!(selectedAttributeField instanceof HTMLSelectElement)) {
      throw new Error("Missing selected check attribute field.");
    }

    const selectedChoice = attributeChoices.find(
      ({ key }) => key === selectedAttributeField.value,
    );

    if (!selectedChoice) {
      throw new Error("Invalid selected check attribute.");
    }

    selectedAttribute = selectedChoice.key;
  }

  const stepAdjustments = Object.fromEntries(
    components.map((component) => {
      const key = component.key;
      const field = button.form?.elements.namedItem(`stepAdjustments.${key}`);

      if (!(field instanceof HTMLInputElement)) {
        throw new Error(`Missing check step adjustment field for ${key}.`);
      }

      const adjustment = field.valueAsNumber;

      if (
        !Number.isInteger(adjustment) ||
        adjustment < MIN_STEP_ADJUSTMENT ||
        adjustment > MAX_STEP_ADJUSTMENT
      ) {
        throw new Error(
          `Check step adjustment for ${key} must be an integer from -4 to 4.`,
        );
      }

      return [
        component.kind === "attribute" && selectedAttribute
          ? selectedAttribute
          : key,
        adjustment,
      ];
    }),
  );

  const copiedExtraDice = extraDice.map((extraDie) => ({ ...extraDie }));

  if (lockedDifficulty !== undefined) {
    return {
      difficulty: lockedDifficulty,
      ...(selectedAttribute ? { selectedAttribute } : {}),
      stepAdjustments,
      extraDice: copiedExtraDice,
      abilityUses: abilityUses.map((reference) => ({ ...reference })),
    };
  }

  if (!allowDifficulty || !(difficultyField instanceof HTMLInputElement) || difficultyField.value.trim() === "") {
    return {
      ...(selectedAttribute ? { selectedAttribute } : {}),
      stepAdjustments,
      extraDice: copiedExtraDice,
      abilityUses: abilityUses.map((reference) => ({ ...reference })),
    };
  }

  const difficulty = difficultyField.valueAsNumber;

  if (!Number.isInteger(difficulty) || difficulty < 1) {
    throw new Error("Check difficulty must be a positive integer.");
  }

  return {
    difficulty,
    ...(selectedAttribute ? { selectedAttribute } : {}),
    stepAdjustments,
    extraDice: copiedExtraDice,
    abilityUses: abilityUses.map((reference) => ({ ...reference })),
  };
}

export async function openCheckDialog(
  input: CheckInput,
  options?: CheckDialogOptions,
): Promise<CheckDialogResult | null> {
  validateAttributeChoices(input, options?.attributeChoices);
  const selectedExtraDice: CheckExtraDieInput[] = [];
  const selectedAbilityUses: CheckAbilityUseReference[] = [];
  const content = await foundry.applications.handlebars.renderTemplate(
    CHECK_DIALOG_TEMPLATE,
    buildCheckDialogViewModel(input, options),
  );
  const { DialogV2 } = foundry.applications.api;

  const result = await DialogV2.input<CheckDialogResult | "cancel">({
    buttons: [
      {
        action: "cancel",
        label: "ORDEMPARANORMAL2.CheckDialog.Actions.Cancel",
      },
    ],
    classes: ["ordemparanormal2", "op2-check-dialog"],
    content,
    modal: true,
    ok: {
      action: "roll",
      label: "ORDEMPARANORMAL2.CheckDialog.Actions.Roll",
      icon: "fa-solid fa-dice-d20",
      default: true,
      callback: (_event, button) =>
        readDialogResult(
          button,
          input.components,
          selectedExtraDice,
          selectedAbilityUses,
          options?.attributeChoices,
          options?.allowDifficulty !== false,
          options?.lockedDifficulty,
        ),
    },
    position: {
      width: 520,
    },
    render: (_event, dialog) => {
      const controllers = attachStepAdjustmentControls(dialog.element);
      const initialAttribute = input.components.find(({ kind }) => kind === "attribute")?.key;
      if (!initialAttribute) throw new Error("A Check requires an attribute component.");
      let selectedAttribute = initialAttribute as AttributeKey;
      let abilityCount = 0;
      let refreshAbilities = (): void => undefined;

      if (options?.attributeChoices) {
        const attributeComponent = input.components.find(
          ({ kind }) => kind === "attribute",
        );

        if (!attributeComponent) {
          throw new Error("Alternate attributes require an attribute component.");
        }

        attachAttributeSelectionControl(
          dialog.element,
          attributeComponent.key,
          options.attributeChoices,
          controllers,
          (key) => {
            selectedAttribute = key;
            refreshAbilities();
          },
        );
      }

      const situationalController = attachSituationalDiceControls(
        dialog.element,
        input.components.length,
        selectedExtraDice,
        game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Situational.Label"),
        game.i18n.localize(
          "ORDEMPARANORMAL2.CheckDialog.Actions.RemoveExtraDie",
        ),
        () => abilityCount,
        () => refreshAbilities(),
      );
      if (options?.abilitySource?.abilities.some((ability) =>
        ability.uses.some(({ checkIntegration }) => checkIntegration !== null)
      )) {
        const abilityController = attachAbilityUseControls(
          dialog.element,
          input,
          options.abilitySource,
          selectedExtraDice,
          selectedAbilityUses,
          () => selectedAttribute,
          () => {
            abilityCount = abilityController.count();
            situationalController.refresh();
          },
        );
        abilityCount = abilityController.count();
        refreshAbilities = () => {
          abilityController.refresh();
          abilityCount = abilityController.count();
          situationalController.refresh();
        };
        refreshAbilities();
      }
    },
    rejectClose: false,
    window: {
      title: game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Title"),
      resizable: false,
    },
  });

  return result === "cancel" ? null : result;
}
