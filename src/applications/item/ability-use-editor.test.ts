import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import Handlebars from "handlebars";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  deleteAbilityUse: vi.fn(),
  moveAbilityUse: vi.fn(),
  saveExistingAbilityUse: vi.fn(),
  saveNewAbilityUse: vi.fn(),
}));

vi.mock("../../adapters/foundry/abilities/update-ability-uses", () => persistence);

const abilityUse = {
  id: "primary",
  name: "Forma principal",
  description: "<p>Descrição</p>",
  cost: { source: "determination" as const, amount: 2 },
  minimumLevel: 3,
  checkIntegration: null,
};

interface TestEditor {
  closed: boolean;
  _prepareContext(options: object): Promise<{ editable: boolean }>;
}

type EditorAction = (this: TestEditor) => Promise<void>;
type EditorSubmit = (
  this: TestEditor,
  event: { preventDefault(): void },
  form: object,
  formData: { object: Record<string, unknown> },
) => Promise<void>;

let AbilityUseEditorClass: {
  new (ability: object, use: typeof abilityUse | null): TestEditor;
  DEFAULT_OPTIONS: {
    actions: Record<string, EditorAction>;
    form: { handler: EditorSubmit };
  };
};
let template: string;
let lockedPacks: Map<string, { locked: boolean }>;
const confirmRemove = vi.fn();

beforeAll(async () => {
  class MockApplicationV2 {
    readonly element = null;
    closed = false;

    constructor(_options?: object) {}

    async close(): Promise<this> {
      this.closed = true;
      return this;
    }

    async render(): Promise<this> { return this; }
  }

  lockedPacks = new Map();
  vi.stubGlobal("foundry", {
    applications: {
      api: {
        ApplicationV2: MockApplicationV2,
        DialogV2: { confirm: confirmRemove },
        HandlebarsApplicationMixin: <T>(Base: T): T => Base,
      },
      ux: {
        FormDataExtended: class {},
        TextEditor: {
          implementation: { enrichHTML: vi.fn(async (description: string) => description) },
        },
      },
    },
  });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
    packs: { get: (id: string) => lockedPacks.get(id) },
    user: {},
  });
  vi.stubGlobal("ui", { notifications: { error: vi.fn() } });

  const [module, templateSource] = await Promise.all([
    import("./ability-use-editor"),
    readFile(fileURLToPath(new URL("../../../templates/item/ability-use-editor.hbs", import.meta.url)), "utf8"),
  ]);
  AbilityUseEditorClass = module.AbilityUseEditor as unknown as typeof AbilityUseEditorClass;
  template = templateSource;
  Handlebars.registerHelper("localize", (key: string) => key);
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  lockedPacks.clear();
  confirmRemove.mockReset().mockResolvedValue(true);
  for (const helper of Object.values(persistence)) helper.mockReset();
  persistence.saveExistingAbilityUse.mockResolvedValue({ status: "unchanged", uses: [abilityUse] });
});

function ability(options: { editable?: boolean; pack?: string | null } = {}) {
  return {
    uuid: options.pack ? `Compendium.${options.pack}.Item.ability` : "Item.ability",
    pack: options.pack ?? null,
    isOwner: true,
    system: { resource: null, uses: [abilityUse] },
    canUserModify: vi.fn(() => options.editable ?? true),
    update: vi.fn(),
  };
}

async function contextFor(editor: TestEditor) {
  return editor._prepareContext({}) as Promise<Record<string, unknown>>;
}

function renderEditor(context: Record<string, unknown>): string {
  return Handlebars.compile(template)(context);
}

describe("AbilityUseEditor", () => {
  it("uses a native ApplicationV2 form and keeps rich text in a local draft", async () => {
    const [source, localizationSource] = await Promise.all([
      readFile(fileURLToPath(new URL("./ability-use-editor.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url)), "utf8"),
    ]);
    const localization = JSON.parse(localizationSource) as {
      ORDEMPARANORMAL2: { AbilitySheet: { CostSources: Record<string, string> } };
    };

    expect(source).toContain("HandlebarsApplicationMixin(ApplicationV2)");
    expect(source).toContain('tag: "form"');
    expect(template).toContain("<prose-mirror");
    expect(template).toContain('name="description"');
    expect(template).toContain('name="minimumLevel"');
    expect(template).not.toContain('name="system.uses');
    expect(localization.ORDEMPARANORMAL2.AbilitySheet.CostSources).toEqual({
      none: "Sem custo",
      health: "PV",
      determination: "PD",
      resource: "Recurso",
    });
  });

  it("opens an editable Ability use with all existing edit actions", async () => {
    const editor = new AbilityUseEditorClass(ability(), abilityUse);
    const context = await contextFor(editor);
    const html = renderEditor(context);

    expect(context.editable).toBe(true);
    expect(html).toContain('data-action="remove"');
    expect(html).toContain('data-action="moveUp"');
    expect(html).toContain('data-action="moveDown"');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain(" readonly");
  });

  it("opens a use from a locked compendium in read-only mode", async () => {
    lockedPacks.set("ordemparanormal2.abilities", { locked: true });
    const editor = new AbilityUseEditorClass(
      ability({ pack: "ordemparanormal2.abilities" }),
      abilityUse,
    );
    const context = await contextFor(editor);
    const html = renderEditor(context);

    expect(context.editable).toBe(false);
    expect(html).toContain('name="name"');
    expect(html).toContain(" readonly");
    expect(html).toContain('<prose-mirror name="description"');
    expect(html).toContain(" disabled");
    expect(html).toContain('data-action="cancel"');
    expect(html).not.toContain('data-action="remove"');
    expect(html).not.toContain('data-action="moveUp"');
    expect(html).not.toContain('data-action="moveDown"');
    expect(html).not.toContain('type="submit"');
  });

  it("does not call persistence from any read-only handler", async () => {
    lockedPacks.set("ordemparanormal2.abilities", { locked: true });
    const document = ability({ pack: "ordemparanormal2.abilities" });
    const editor = new AbilityUseEditorClass(document, abilityUse);
    const preventDefault = vi.fn();

    await AbilityUseEditorClass.DEFAULT_OPTIONS.form.handler.call(
      editor,
      { preventDefault },
      {},
      { object: {} },
    );
    await AbilityUseEditorClass.DEFAULT_OPTIONS.actions.moveUp.call(editor);
    await AbilityUseEditorClass.DEFAULT_OPTIONS.actions.moveDown.call(editor);
    await AbilityUseEditorClass.DEFAULT_OPTIONS.actions.remove.call(editor);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(confirmRemove).not.toHaveBeenCalled();
    expect(document.update).not.toHaveBeenCalled();
    for (const helper of Object.values(persistence)) expect(helper).not.toHaveBeenCalled();
  });

  it("preserves saving an existing use for editable Abilities", async () => {
    const document = ability();
    const editor = new AbilityUseEditorClass(document, abilityUse);

    await AbilityUseEditorClass.DEFAULT_OPTIONS.form.handler.call(
      editor,
      { preventDefault: vi.fn() },
      {},
      {
        object: {
          name: "Forma revisada",
          description: "<p>Nova descrição</p>",
          costSource: "health",
          costAmount: 1,
          minimumLevel: "4",
        },
      },
    );

    expect(persistence.saveExistingAbilityUse).toHaveBeenCalledExactlyOnceWith(
      document,
      abilityUse,
      {
        ...abilityUse,
        name: "Forma revisada",
        description: "<p>Nova descrição</p>",
        cost: { source: "health", amount: 1 },
        minimumLevel: 4,
      },
    );
    expect(editor.closed).toBe(true);
  });

  it("saves the supported PRE-ROLL extra-die integration", async () => {
    const document = ability();
    const editor = new AbilityUseEditorClass(document, abilityUse);
    await AbilityUseEditorClass.DEFAULT_OPTIONS.form.handler.call(
      editor,
      { preventDefault: vi.fn() },
      {},
      { object: {
        name: "Forma", description: "", costSource: "determination", costAmount: 2,
        minimumLevel: "", modificationType: "extraDie", applicabilityType: "skill",
        applicabilitySkill: "fighting", modificationDie: "8",
      } },
    );
    expect(persistence.saveExistingAbilityUse).toHaveBeenCalledWith(
      document,
      abilityUse,
      expect.objectContaining({
        checkIntegration: { modification: { type: "extraDie", applicability: { type: "skill", skill: "fighting" }, die: 8 } },
      }),
    );
  });
});
