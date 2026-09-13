import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const editorInstances = vi.hoisted(() => [] as Array<{
  ability: object;
  use: object | null;
  render: ReturnType<typeof vi.fn>;
}>);

vi.mock("./ability-use-editor", () => ({
  AbilityUseEditor: class {
    readonly render = vi.fn(async () => this);

    constructor(
      readonly ability: object,
      readonly use: object | null,
      _onClosed: () => void,
    ) {
      editorInstances.push(this);
    }

    bringToFront(): void {}
    async close(): Promise<void> {}
  },
}));

const use = {
  id: "primary",
  name: "Forma principal",
  description: "<p>Descrição</p>",
  cost: { source: "none" as const, amount: 0 },
  minimumLevel: null,
};

interface TestSheet {
  readonly document: object;
  readonly isEditable: boolean;
  readonly submit: ReturnType<typeof vi.fn>;
}

type SheetAction = (
  this: TestSheet,
  event?: object,
  target?: { dataset: { useId?: string } },
) => Promise<void>;

let AbilityItemSheetClass: {
  new (options: { document: object; editable: boolean }): TestSheet;
  DEFAULT_OPTIONS: { actions: Record<string, SheetAction> };
};

beforeAll(async () => {
  class MockItemSheetV2 {
    readonly document: object;
    readonly isEditable: boolean;
    readonly submit = vi.fn(async () => undefined);
    readonly tabGroups = { sheet: "general" };

    constructor(options: { document: object; editable: boolean }) {
      this.document = options.document;
      this.isEditable = options.editable;
    }

    protected async _prepareContext(): Promise<object> { return {}; }
    protected _attachPartListeners(): void {}
    protected async _preClose(): Promise<void> {}
    protected _onClose(): void {}
  }

  vi.stubGlobal("foundry", {
    applications: {
      api: {
        DialogV2: { confirm: vi.fn() },
        HandlebarsApplicationMixin: <T>(Base: T): T => Base,
      },
      sheets: { ItemSheetV2: MockItemSheetV2 },
      ux: { TextEditor: { implementation: { enrichHTML: vi.fn() } } },
    },
  });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
  vi.stubGlobal("ui", { notifications: { error: vi.fn() } });

  const module = await import("./ability-item-sheet");
  AbilityItemSheetClass = module.AbilityItemSheet as unknown as typeof AbilityItemSheetClass;
});

afterAll(() => vi.unstubAllGlobals());
beforeEach(() => editorInstances.splice(0));

function ability() {
  return { system: { resource: null, uses: [use] } };
}

describe("AbilityItemSheet use actions", () => {
  it("opens an existing use from an editable Ability after submitting pending edits", async () => {
    const document = ability();
    const sheet = new AbilityItemSheetClass({ document, editable: true });

    await AbilityItemSheetClass.DEFAULT_OPTIONS.actions.openUse.call(
      sheet,
      {},
      { dataset: { useId: use.id } },
    );

    expect(sheet.submit).toHaveBeenCalledOnce();
    expect(editorInstances).toHaveLength(1);
    expect(editorInstances[0]).toMatchObject({ ability: document, use });
    expect(editorInstances[0]?.render).toHaveBeenCalledWith({ force: true });
  });

  it("opens an existing use from a read-only Ability without submitting", async () => {
    const document = ability();
    const sheet = new AbilityItemSheetClass({ document, editable: false });

    await AbilityItemSheetClass.DEFAULT_OPTIONS.actions.openUse.call(
      sheet,
      {},
      { dataset: { useId: use.id } },
    );

    expect(sheet.submit).not.toHaveBeenCalled();
    expect(editorInstances).toHaveLength(1);
    expect(editorInstances[0]).toMatchObject({ ability: document, use });
  });

  it("keeps create unavailable for a read-only Ability", async () => {
    const sheet = new AbilityItemSheetClass({ document: ability(), editable: false });

    await AbilityItemSheetClass.DEFAULT_OPTIONS.actions.createUse.call(sheet);

    expect(sheet.submit).not.toHaveBeenCalled();
    expect(editorInstances).toHaveLength(0);
  });
});
