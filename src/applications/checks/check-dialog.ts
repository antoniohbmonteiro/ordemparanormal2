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

const CHECK_DIALOG_TEMPLATE =
  "systems/ordemparanormal2/templates/checks/check-dialog.hbs";

export interface CheckDialogResult {
  readonly difficulty?: number;
  readonly selectedAttribute?: AttributeKey;
  readonly stepAdjustments: CheckStepAdjustments;
  readonly extraDice: readonly CheckExtraDieInput[];
}

export interface CheckDialogAttributeChoice {
  readonly key: AttributeKey;
  readonly label: string;
  readonly die: DieStep;
}

export interface CheckDialogOptions {
  readonly attributeChoices?: readonly CheckDialogAttributeChoice[];
}

const MIN_STEP_ADJUSTMENT = -4;
const MAX_STEP_ADJUSTMENT = 4;

interface CheckDialogViewModel {
  readonly name: string;
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
}

function buildCheckDialogViewModel(
  input: CheckInput,
  options?: CheckDialogOptions,
): CheckDialogViewModel {
  return {
    name: input.check.name,
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
): void {
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
    const dieCount = componentCount + extraDice.length;
    const atLimit = dieCount >= 4;
    counter.textContent = `${dieCount} / 4`;
    counter.dataset.atLimit = String(atLimit);
    addedSection.hidden = extraDice.length === 0;

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
    });

    chip.append(icon, label, remove);
    chipList.append(chip);
  };

  for (const button of addButtons) {
    button.addEventListener("click", () => {
      if (button.disabled || componentCount + extraDice.length >= 4) return;

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
    });
  }

  update();
}

function readDialogResult(
  button: HTMLButtonElement,
  components: CheckInput["components"],
  extraDice: readonly CheckExtraDieInput[],
  attributeChoices?: readonly CheckDialogAttributeChoice[],
): CheckDialogResult {
  const difficultyField = button.form?.elements.namedItem("difficulty");

  if (!(difficultyField instanceof HTMLInputElement)) {
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

  if (difficultyField.value.trim() === "") {
    return {
      ...(selectedAttribute ? { selectedAttribute } : {}),
      stepAdjustments,
      extraDice: copiedExtraDice,
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
  };
}

export async function openCheckDialog(
  input: CheckInput,
  options?: CheckDialogOptions,
): Promise<CheckDialogResult | null> {
  validateAttributeChoices(input, options?.attributeChoices);
  const selectedExtraDice: CheckExtraDieInput[] = [];
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
          options?.attributeChoices,
        ),
    },
    position: {
      width: 520,
    },
    render: (_event, dialog) => {
      const controllers = attachStepAdjustmentControls(dialog.element);

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
        );
      }

      attachSituationalDiceControls(
        dialog.element,
        input.components.length,
        selectedExtraDice,
        game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Situational.Label"),
        game.i18n.localize(
          "ORDEMPARANORMAL2.CheckDialog.Actions.RemoveExtraDie",
        ),
      );
    },
    rejectClose: false,
    window: {
      title: game.i18n.localize("ORDEMPARANORMAL2.CheckDialog.Title"),
      resizable: false,
    },
  });

  return result === "cancel" ? null : result;
}
