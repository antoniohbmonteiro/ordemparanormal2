import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { CheckInput } from "../../core/checks/check";
import { openCheckDialog } from "./check-dialog";

const INPUT: CheckInput = {
  check: { kind: "skill", key: "research", name: "Pesquisar" },
  components: [
    { kind: "attribute", key: "mind", label: "Mente", die: 8 },
    { kind: "skill", key: "research", label: "Pesquisar", die: 6 },
  ],
  extraDice: [],
};

const ALTERNATE_INPUT: CheckInput = {
  check: { kind: "skill", key: "acrobatics", name: "Acrobacia" },
  components: [
    { kind: "attribute", key: "physical", label: "Físico", die: 10 },
    { kind: "skill", key: "acrobatics", label: "Acrobacia", die: 8 },
  ],
  extraDice: [],
};

const ATTRIBUTE_CHOICES = [
  { key: "physical", label: "Físico", die: 10 },
  { key: "mind", label: "Mente", die: 6 },
  { key: "emotion", label: "Emoção", die: 8 },
] as const;

let template = "";

beforeAll(async () => {
  const templatePath = fileURLToPath(
    new URL("../../../templates/checks/check-dialog.hbs", import.meta.url),
  );
  template = await readFile(templatePath, "utf8");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

class MockInputElement {
  constructor(readonly value: string) {}

  get valueAsNumber(): number {
    return Number(this.value);
  }
}

class MockSelectElement {
  constructor(readonly value: string) {}
}

let renderTemplateMock = vi.fn();

interface DialogOptions {
  readonly ok: {
    readonly callback: (
      event: SubmitEvent,
      button: HTMLButtonElement,
    ) => unknown;
  };
  readonly render: (
    event: Event,
    dialog: { readonly element: HTMLElement },
  ) => void;
}

function stubDialogInput(result: unknown = null) {
  const input = vi.fn().mockResolvedValue(result);
  renderTemplateMock = vi.fn().mockResolvedValue("dialog");
  vi.stubGlobal("foundry", {
    applications: {
      api: { DialogV2: { input } },
      handlebars: {
        renderTemplate: renderTemplateMock,
      },
    },
  });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
  });
  return input;
}

function createSubmitButton(
  difficulty: string,
  stepAdjustments: Readonly<Record<string, string>>,
  selectedAttribute?: string,
): HTMLButtonElement {
  const fields: Readonly<
    Record<string, MockInputElement | MockSelectElement>
  > = {
    difficulty: new MockInputElement(difficulty),
    ...(selectedAttribute === undefined
      ? {}
      : { selectedAttribute: new MockSelectElement(selectedAttribute) }),
    ...Object.fromEntries(
      Object.entries(stepAdjustments).map(([key, adjustment]) => [
        `stepAdjustments.${key}`,
        new MockInputElement(adjustment),
      ]),
    ),
  };

  return {
    form: {
      elements: {
        namedItem: (name: string) => fields[name] ?? null,
      },
    },
  } as unknown as HTMLButtonElement;
}

describe("check dialog cancellation", () => {
  it.each(["cancel", null])(
    "normalizes DialogV2 result %j to null",
    async (dialogResult) => {
      stubDialogInput(dialogResult);

      await expect(openCheckDialog(INPUT)).resolves.toBeNull();
    },
  );

  it("does not expose attribute choices when none are configured", async () => {
    stubDialogInput("cancel");

    await openCheckDialog(INPUT);

    const viewModel = renderTemplateMock.mock.calls[0]?.[1] as {
      components: readonly { attributeChoices?: unknown }[];
    };
    expect(viewModel.components[0]).not.toHaveProperty("attributeChoices");
  });

  it("rejects alternate choices for a pure attribute check", async () => {
    stubDialogInput("cancel");
    const attributeInput: CheckInput = {
      check: { kind: "attribute", key: "physical", name: "Físico" },
      components: [
        { kind: "attribute", key: "physical", label: "Físico", die: 10 },
      ],
      extraDice: [],
    };

    await expect(
      openCheckDialog(attributeInput, {
        attributeChoices: ATTRIBUTE_CHOICES,
      }),
    ).rejects.toThrow("cannot offer alternate attributes");
  });
});

describe("check dialog result", () => {
  it.each([
    [
      "",
      "0",
      "0",
      { stepAdjustments: { mind: 0, research: 0 }, extraDice: [] },
    ],
    [
      "9",
      "0",
      "1",
      {
        difficulty: 9,
        stepAdjustments: { mind: 0, research: 1 },
        extraDice: [],
      },
    ],
    [
      "12",
      "-2",
      "2",
      {
        difficulty: 12,
        stepAdjustments: { mind: -2, research: 2 },
        extraDice: [],
      },
    ],
  ] as const)(
    "reads difficulty %j and independent adjustments %j/%j",
    async (difficulty, mindAdjustment, researchAdjustment, expected) => {
      vi.stubGlobal("HTMLInputElement", MockInputElement);
      const input = stubDialogInput();
      input.mockImplementation(async (options: DialogOptions) =>
        options.ok.callback(
          {} as SubmitEvent,
          createSubmitButton(difficulty, {
            mind: mindAdjustment,
            research: researchAdjustment,
          }),
        ),
      );

      await expect(openCheckDialog(INPUT)).resolves.toEqual(expected);
    },
  );

  it.each(["-5", "4.5", "5"])(
    "rejects out-of-range component adjustment %s",
    async (researchAdjustment) => {
      vi.stubGlobal("HTMLInputElement", MockInputElement);
      const input = stubDialogInput();
      input.mockImplementation(async (options: DialogOptions) =>
        options.ok.callback(
          {} as SubmitEvent,
          createSubmitButton("", { mind: "0", research: researchAdjustment }),
        ),
      );

      await expect(openCheckDialog(INPUT)).rejects.toThrow("-4 to 4");
    },
  );

  it("returns the selected attribute and keys its slot adjustment accordingly", async () => {
    vi.stubGlobal("HTMLInputElement", MockInputElement);
    vi.stubGlobal("HTMLSelectElement", MockSelectElement);
    const input = stubDialogInput();
    input.mockImplementation(async (options: DialogOptions) =>
      options.ok.callback(
        {} as SubmitEvent,
        createSubmitButton("", { physical: "1", acrobatics: "0" }, "mind"),
      ),
    );

    await expect(
      openCheckDialog(ALTERNATE_INPUT, {
        attributeChoices: ATTRIBUTE_CHOICES,
      }),
    ).resolves.toEqual({
      selectedAttribute: "mind",
      stepAdjustments: { mind: 1, acrobatics: 0 },
      extraDice: [],
    });
  });

  it("rejects an attribute outside the supplied choices", async () => {
    vi.stubGlobal("HTMLInputElement", MockInputElement);
    vi.stubGlobal("HTMLSelectElement", MockSelectElement);
    const input = stubDialogInput();
    input.mockImplementation(async (options: DialogOptions) =>
      options.ok.callback(
        {} as SubmitEvent,
        createSubmitButton(
          "",
          { physical: "0", acrobatics: "0" },
          "invalid",
        ),
      ),
    );

    await expect(
      openCheckDialog(ALTERNATE_INPUT, {
        attributeChoices: ATTRIBUTE_CHOICES,
      }),
    ).rejects.toThrow("Invalid selected check attribute");
  });
});

describe("check dialog step adjustment controls", () => {
  it("renders effective and base dice without adjustment numbers", () => {
    expect(template).toMatch(
      /<button\s+type="button"\s+data-step-adjustment-decrease/,
    );
    expect(template).toMatch(
      /<button\s+type="button"\s+data-step-adjustment-increase/,
    );
    expect(template).toMatch(
      /<input\s+type="number"\s+name="stepAdjustments\.\{\{key\}\}"[\s\S]*?hidden\s*\/>/,
    );
    expect(template).toContain("data-effective-die");
    expect(template).toContain("data-base-die-label hidden");
    expect(template).not.toContain("data-step-adjustment-value");
    expect(template).toContain("data-attribute-select");
    expect(template).toContain("{{#if attributeChoices}}");
  });

  const createControl = (
    baseDie: number,
    componentKey = `component-${baseDie}`,
  ) => {
    const handlers = new Map<string, () => void>();
    const field = { value: "99" };
    const decrease = {
      disabled: false,
      addEventListener: (_type: string, handler: () => void) => {
        handlers.set("decrease", handler);
      },
    };
    const increase = {
      disabled: false,
      addEventListener: (_type: string, handler: () => void) => {
        handlers.set("increase", handler);
      },
    };
    const effectiveDie = {
      dataset: {} as Record<string, string>,
      textContent: "",
    };
    const baseDieLabel = { hidden: false, textContent: `(d${baseDie})` };
    const elements: Record<string, unknown> = {
      'input[type="number"]': field,
      "[data-step-adjustment-decrease]": decrease,
      "[data-step-adjustment-increase]": increase,
      "[data-effective-die]": effectiveDie,
      "[data-base-die-label]": baseDieLabel,
    };

    return {
      field,
      decrease,
      increase,
      effectiveDie,
      baseDieLabel,
      handlers,
      root: {
        dataset: { baseDie: String(baseDie), componentKey },
        querySelector: (selector: string) => elements[selector] ?? null,
        setAttribute: () => undefined,
      } as unknown as HTMLElement,
    };
  };

  class MockElement {
    readonly dataset: Record<string, string> = {};
    readonly children: MockElement[] = [];
    readonly handlers = new Map<string, () => void>();
    className = "";
    disabled = false;
    hidden = false;
    parent?: MockElement;
    textContent = "";
    type = "";
    value = "";

    addEventListener(type: string, handler: () => void): void {
      this.handlers.set(type, handler);
    }

    append(...children: MockElement[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    remove(): void {
      if (!this.parent) return;
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
    }

    setAttribute(): void {}
  }

  const createDialogRoot = (
    controls: readonly ReturnType<typeof createControl>[],
    attributeSelect?: MockElement,
  ) => {
    const addButtons = [4, 6, 8, 10, 12].map((die) => {
      const button = new MockElement();
      button.dataset.extraDieAdd = String(die);
      return button;
    });
    const counter = new MockElement();
    const addedSection = new MockElement();
    const chipList = new MockElement();
    const ownerDocument = {
      createElement: () => new MockElement(),
    };
    const root = {
      ownerDocument,
      querySelectorAll: (selector: string) =>
        selector === "[data-step-adjustment-control]"
          ? controls.map(({ root: control }) => control)
          : selector === "[data-extra-die-add]"
            ? addButtons
            : [],
      querySelector: (selector: string) =>
        ({
          "[data-dice-count]": counter,
          "[data-extra-dice-added]": addedSection,
          "[data-extra-dice-list]": chipList,
          "[data-attribute-select]": attributeSelect,
        })[selector] ?? null,
    } as unknown as HTMLElement;

    return {
      addButtons,
      addedSection,
      attributeSelect,
      chipList,
      counter,
      root,
    };
  };

  const renderControls = async (
    controls: readonly ReturnType<typeof createControl>[],
  ): Promise<void> => {
    const input = stubDialogInput();
    await openCheckDialog(INPUT);
    const { root } = createDialogRoot(controls);
    const options = input.mock.calls[0]?.[0] as unknown as DialogOptions;

    options.render({} as Event, { element: root });
  };

  it("marks the base attribute as the initial selector choice", async () => {
    stubDialogInput("cancel");

    await openCheckDialog(ALTERNATE_INPUT, {
      attributeChoices: ATTRIBUTE_CHOICES,
    });

    const viewModel = renderTemplateMock.mock.calls[0]?.[1] as {
      components: readonly {
        attributeChoices?: readonly {
          key: string;
          selected: boolean;
        }[];
      }[];
    };
    expect(viewModel.components[0]?.attributeChoices).toEqual([
      { key: "physical", label: "Físico", selected: true },
      { key: "mind", label: "Mente", selected: false },
      { key: "emotion", label: "Emoção", selected: false },
    ]);
    expect(viewModel.components[1]).not.toHaveProperty("attributeChoices");
  });

  it("keeps the attribute slot adjustment while changing its base die", async () => {
    const input = stubDialogInput("cancel");
    const physical = createControl(10, "physical");
    const acrobatics = createControl(8, "acrobatics");
    const attributeSelect = new MockElement();
    attributeSelect.value = "physical";
    const dialogRoot = createDialogRoot(
      [physical, acrobatics],
      attributeSelect,
    );

    await openCheckDialog(ALTERNATE_INPUT, {
      attributeChoices: ATTRIBUTE_CHOICES,
    });
    const options = input.mock.calls[0]?.[0] as unknown as DialogOptions;
    options.render({} as Event, { element: dialogRoot.root });

    physical.handlers.get("increase")?.();
    expect(physical.field.value).toBe("1");
    expect(physical.effectiveDie.textContent).toBe("d12");

    attributeSelect.value = "mind";
    attributeSelect.handlers.get("change")?.();
    expect(physical.field.value).toBe("1");
    expect(physical.baseDieLabel.textContent).toBe("(d6)");
    expect(physical.effectiveDie.textContent).toBe("d8");

    attributeSelect.value = "emotion";
    attributeSelect.handlers.get("change")?.();
    expect(physical.field.value).toBe("1");
    expect(physical.baseDieLabel.textContent).toBe("(d8)");
    expect(physical.effectiveDie.textContent).toBe("d10");
  });

  it("shows independent effective dice and restores the base presentation", async () => {
    const mind = createControl(8);
    const research = createControl(6);

    await renderControls([mind, research]);

    expect(mind.field.value).toBe("0");
    expect(research.field.value).toBe("0");
    expect(mind.effectiveDie.textContent).toBe("d8");
    expect(research.effectiveDie.textContent).toBe("d6");
    expect(mind.baseDieLabel.hidden).toBe(true);
    expect(research.baseDieLabel.hidden).toBe(true);

    research.handlers.get("increase")?.();
    expect(mind.field.value).toBe("0");
    expect(mind.effectiveDie.textContent).toBe("d8");
    expect(research.field.value).toBe("1");
    expect(research.effectiveDie.textContent).toBe("d8");
    expect(research.baseDieLabel.hidden).toBe(false);
    expect(research.baseDieLabel.textContent).toBe("(d6)");
    expect(research.effectiveDie.dataset.adjustmentDirection).toBe(
      "increased",
    );

    research.handlers.get("decrease")?.();
    expect(research.field.value).toBe("0");
    expect(research.effectiveDie.textContent).toBe("d6");
    expect(research.baseDieLabel.hidden).toBe(true);
    expect(research.effectiveDie.dataset.adjustmentDirection).toBeUndefined();

    mind.handlers.get("decrease")?.();
    mind.handlers.get("decrease")?.();
    expect(mind.field.value).toBe("-2");
    expect(mind.effectiveDie.textContent).toBe("d4");
    expect(mind.baseDieLabel.hidden).toBe(false);
    expect(mind.effectiveDie.dataset.adjustmentDirection).toBe("decreased");
    expect(mind.decrease.disabled).toBe(true);
  });

  it("stops at effective die limits without accumulating adjustment", async () => {
    const d4 = createControl(4);
    const d10 = createControl(10);
    const d12 = createControl(12);
    const d20 = createControl(20);

    await renderControls([d4, d10, d12, d20]);

    expect(d4.decrease.disabled).toBe(true);
    expect(d12.increase.disabled).toBe(true);
    expect(d20.decrease.disabled).toBe(true);
    expect(d20.increase.disabled).toBe(true);

    d10.handlers.get("increase")?.();
    expect(d10.field.value).toBe("1");
    expect(d10.effectiveDie.textContent).toBe("d12");
    expect(d10.baseDieLabel.hidden).toBe(false);
    expect(d10.increase.disabled).toBe(true);

    d10.handlers.get("increase")?.();
    expect(d10.field.value).toBe("1");

    d10.handlers.get("decrease")?.();
    expect(d10.field.value).toBe("0");
    expect(d10.effectiveDie.textContent).toBe("d10");
    expect(d10.baseDieLabel.hidden).toBe(true);
    expect(d10.increase.disabled).toBe(false);
  });

  it("adds repeated situational dice, enforces 4/4, and removes one occurrence", async () => {
    vi.stubGlobal("HTMLInputElement", MockInputElement);
    const input = stubDialogInput();
    const mind = createControl(8);
    const research = createControl(6);
    const dialogRoot = createDialogRoot([mind, research]);
    input.mockImplementation(async (options: DialogOptions) => {
      options.render({} as Event, { element: dialogRoot.root });
      dialogRoot.addButtons[0]?.handlers.get("click")?.();
      dialogRoot.addButtons[0]?.handlers.get("click")?.();

      expect(dialogRoot.counter.textContent).toBe("4 / 4");
      expect(dialogRoot.addButtons.every(({ disabled }) => disabled)).toBe(true);
      expect(dialogRoot.chipList.children).toHaveLength(2);

      const firstRemove = dialogRoot.chipList.children[0]?.children[2];
      firstRemove?.handlers.get("click")?.();

      expect(dialogRoot.counter.textContent).toBe("3 / 4");
      expect(dialogRoot.addButtons.every(({ disabled }) => !disabled)).toBe(true);

      return options.ok.callback(
        {} as SubmitEvent,
        createSubmitButton("", { mind: "0", research: "0" }),
      );
    });

    await expect(openCheckDialog(INPUT)).resolves.toEqual({
      stepAdjustments: { mind: 0, research: 0 },
      extraDice: [
        {
          id: "situational-2",
          die: 4,
          source: "situational",
          label: "ORDEMPARANORMAL2.CheckDialog.Situational.Label",
        },
      ],
    });
  });
});
