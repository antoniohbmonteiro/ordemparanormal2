import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pickerMocks = vi.hoisted(() => {
  class MockPicker {
    readonly actor: unknown;
    readonly bringToFront = vi.fn();
    readonly close = vi.fn(async () => {
      this.rendered = false;
      this.#emit("close");
      return this;
    });
    readonly itemSheetClose = vi.fn();
    readonly render = vi.fn(async () => {
      this.rendered = true;
      return this;
    });
    rendered = false;
    readonly #listeners = new Map<
      string,
      Array<{ callback: () => void; once: boolean }>
    >();

    constructor(actor: unknown) {
      this.actor = actor;
    }

    addEventListener(
      type: string,
      callback: () => void,
      options?: { once?: boolean },
    ): void {
      const listeners = this.#listeners.get(type) ?? [];
      listeners.push({ callback, once: options?.once === true });
      this.#listeners.set(type, listeners);
    }

    #emit(type: string): void {
      const listeners = this.#listeners.get(type) ?? [];
      for (const listener of listeners) listener.callback();
      this.#listeners.set(
        type,
        listeners.filter((listener) => !listener.once),
      );
    }
  }

  class ProfilePicker extends MockPicker {
    static readonly instances: ProfilePicker[] = [];

    constructor(actor: unknown) {
      super(actor);
      ProfilePicker.instances.push(this);
    }
  }

  class OccupationPicker extends MockPicker {
    static readonly instances: OccupationPicker[] = [];

    constructor(actor: unknown) {
      super(actor);
      OccupationPicker.instances.push(this);
    }
  }

  class AgentSheetSettings extends MockPicker {
    static readonly instances: AgentSheetSettings[] = [];

    constructor(actor: unknown) {
      super(actor);
      AgentSheetSettings.instances.push(this);
    }
  }

  return { AgentSheetSettings, MockPicker, OccupationPicker, ProfilePicker };
});

vi.mock("../profiles/profile-picker", () => ({
  confirmProfileReplacement: vi.fn(),
  ProfilePicker: pickerMocks.ProfilePicker,
}));

vi.mock("../occupations/occupation-picker", () => ({
  confirmOccupationReplacement: vi.fn(),
  OccupationPicker: pickerMocks.OccupationPicker,
}));

vi.mock("./agent-sheet-settings", () => ({
  AgentSheetSettings: pickerMocks.AgentSheetSettings,
}));

interface TestSheet {
  close(): Promise<TestSheet>;
  document: object;
  isEditable: boolean;
  render: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
  _getHeaderControls(): Array<Record<string, unknown>>;
  _onRender(context: object, options: object): Promise<void>;
  element: { style: { setProperty: ReturnType<typeof vi.fn> } };
}

type SheetAction = (this: TestSheet) => Promise<void>;

let AgentSheetClass: {
  new (options: { document: object }): TestSheet;
  DEFAULT_OPTIONS: { actions: Record<string, SheetAction> };
};
const notificationError = vi.fn();

beforeAll(async () => {
  class MockActorSheetV2 {
    static DEFAULT_OPTIONS = {};
    static PARTS = {};
    static TABS = {};

    document: object;
    isEditable = true;
    readonly render = vi.fn(async () => this);
    readonly submit = vi.fn(async () => undefined);
    readonly element = { style: { setProperty: vi.fn() } };
    tabGroups: Record<string, string | null> = { content: "abilities" };

    constructor(options: { document: object }) {
      this.document = options.document;
    }

    async close(): Promise<this> {
      await this._preClose({});
      this._onClose({});
      return this;
    }

    protected async _preClose(_options: object): Promise<void> {}

    protected _onClose(_options: object): void {}

    protected async _onRender(_context: object, _options: object): Promise<void> {}

    protected _getHeaderControls(): Array<Record<string, unknown>> {
      return [{ action: "copyUuid", label: "Copy UUID" }];
    }
  }

  vi.stubGlobal("foundry", {
    applications: {
      api: {
        DialogV2: { confirm: vi.fn() },
        HandlebarsApplicationMixin: <T>(Base: T): T => Base,
      },
      sheets: { ActorSheetV2: MockActorSheetV2 },
    },
  });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
  });
  vi.stubGlobal("ui", {
    notifications: { error: notificationError },
  });

  const module = await import("./agent-sheet");
  AgentSheetClass = module.AgentSheet as unknown as typeof AgentSheetClass;
});

beforeEach(() => {
  pickerMocks.ProfilePicker.instances.length = 0;
  pickerMocks.OccupationPicker.instances.length = 0;
  pickerMocks.AgentSheetSettings.instances.length = 0;
  notificationError.mockClear();
});

function createSheet(): TestSheet {
  return new AgentSheetClass({ document: {} });
}

function action(name: string): SheetAction {
  const handler = AgentSheetClass.DEFAULT_OPTIONS.actions[name];
  if (!handler) throw new Error(`Missing Agent Sheet action: ${name}`);
  return handler;
}

describe("Agent Sheet structural picker lifecycle", () => {
  it.each([
    ["Profile", "openProfilePicker", pickerMocks.ProfilePicker],
    ["Occupation", "openOccupationPicker", pickerMocks.OccupationPicker],
  ] as const)(
    "closes its %s picker before leaving Edit Mode",
    async (_label, openAction, Picker) => {
      const sheet = createSheet();

      await action("toggleEditMode").call(sheet);
      await action(openAction).call(sheet);
      const picker = Picker.instances[0];
      expect(picker).toBeDefined();

      await action("toggleEditMode").call(sheet);

      expect(picker?.close).toHaveBeenCalledOnce();
      expect(picker?.rendered).toBe(false);
      expect(sheet.render).toHaveBeenCalledTimes(2);
      expect(picker?.close.mock.invocationCallOrder[0]).toBeLessThan(
        sheet.render.mock.invocationCallOrder[1] ?? 0,
      );
      expect(sheet.submit).not.toHaveBeenCalled();

      await action(openAction).call(sheet);
      expect(Picker.instances).toHaveLength(1);
    },
  );

  it.each([
    ["Profile", "openProfilePicker", pickerMocks.ProfilePicker],
    ["Occupation", "openOccupationPicker", pickerMocks.OccupationPicker],
  ] as const)(
    "closes its %s picker when the Agent Sheet closes",
    async (_label, openAction, Picker) => {
      const sheet = createSheet();
      await action("toggleEditMode").call(sheet);
      await action(openAction).call(sheet);
      const picker = Picker.instances[0];

      await sheet.close();

      expect(picker?.close).toHaveBeenCalledOnce();
      expect(picker?.rendered).toBe(false);
      expect(picker?.itemSheetClose).not.toHaveBeenCalled();
      expect(sheet.submit).not.toHaveBeenCalled();
    },
  );

  it("replaces a picker reference after that picker closes itself", async () => {
    const sheet = createSheet();
    await action("toggleEditMode").call(sheet);
    await action("openProfilePicker").call(sheet);
    const first = pickerMocks.ProfilePicker.instances[0];

    await first?.close();
    await action("openProfilePicker").call(sheet);

    expect(pickerMocks.ProfilePicker.instances).toHaveLength(2);
    expect(pickerMocks.ProfilePicker.instances[1]).not.toBe(first);
  });

  it("reuses an open picker instead of creating a duplicate", async () => {
    const sheet = createSheet();
    await action("toggleEditMode").call(sheet);
    await action("openOccupationPicker").call(sheet);
    const picker = pickerMocks.OccupationPicker.instances[0];

    await action("openOccupationPicker").call(sheet);

    expect(pickerMocks.OccupationPicker.instances).toHaveLength(1);
    expect(picker?.bringToFront).toHaveBeenCalledOnce();
  });

  it("keeps Edit Mode active when a tracked picker cannot close", async () => {
    const sheet = createSheet();
    await action("toggleEditMode").call(sheet);
    await action("openProfilePicker").call(sheet);
    const picker = pickerMocks.ProfilePicker.instances[0];
    picker?.close.mockRejectedValueOnce(new Error("close failed"));

    await action("toggleEditMode").call(sheet);

    expect(sheet.render).toHaveBeenCalledOnce();
    expect(notificationError).toHaveBeenCalledOnce();

    await action("openProfilePicker").call(sheet);
    expect(pickerMocks.ProfilePicker.instances).toHaveLength(1);
    expect(picker?.bringToFront).toHaveBeenCalledOnce();
  });

  it("preserves native header controls and gates settings only by edit permission", () => {
    const sheet = createSheet();
    const controls = sheet._getHeaderControls();

    expect(controls).toEqual([
      { action: "copyUuid", label: "Copy UUID" },
      expect.objectContaining({
        action: "openSheetSettings",
        label: "ORDEMPARANORMAL2.AgentSheet.Settings.MenuLabel",
        visible: true,
      }),
    ]);

    sheet.isEditable = false;
    expect(sheet._getHeaderControls()[1]).toMatchObject({ visible: false });
  });

  it("reuses settings independently of Edit Mode and closes them with the sheet", async () => {
    const sheet = createSheet();

    await action("openSheetSettings").call(sheet);
    const settings = pickerMocks.AgentSheetSettings.instances[0];
    await action("openSheetSettings").call(sheet);

    expect(pickerMocks.AgentSheetSettings.instances).toHaveLength(1);
    expect(settings?.bringToFront).toHaveBeenCalledOnce();

    await sheet.close();
    expect(settings?.close).toHaveBeenCalledOnce();
  });

  it("applies the prepared effective accent to the Agent Sheet root", async () => {
    const sheet = createSheet();

    await sheet._onRender({ accentColor: "#4176BA" }, {});

    expect(sheet.element.style.setProperty).toHaveBeenCalledWith(
      "--op2-accent",
      "#4176BA",
    );
  });
});
