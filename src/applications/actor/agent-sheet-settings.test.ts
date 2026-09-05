import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class MockInput {
  value: string;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();

  constructor(value: string) {
    this.value = value;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.call(this);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function controls(initial = "#7F252B") {
  const picker = new MockInput(initial);
  const hexadecimal = new MockInput(initial);
  const preview = { style: { backgroundColor: initial } };
  const root = {
    querySelector: vi.fn((selector: string) => {
      if (selector === "[data-accent-picker]") return picker;
      if (selector === "[data-accent-hex]") return hexadecimal;
      if (selector === "[data-accent-preview]") return preview;
      return null;
    }),
  };
  return { root, picker, hexadecimal, preview };
}

interface TestSettings {
  readonly element: ReturnType<typeof controls>["root"];
  closed: boolean;
  close(): Promise<TestSettings>;
  _prepareContext(options: object): Promise<{ accentColor: string }>;
  _attachPartListeners(partId: string, root: object, options: object): void;
}

type SettingsAction = (this: TestSettings) => Promise<void>;
type SettingsSubmit = (
  this: TestSettings,
  event: { preventDefault(): void },
  form: { elements: { namedItem(name: string): unknown } },
  formData: object,
) => Promise<void>;

let AgentSheetSettingsClass: {
  new (actor: object): TestSettings;
  DEFAULT_OPTIONS: {
    actions: Record<string, SettingsAction>;
    form: { handler: SettingsSubmit };
  };
};
const notificationError = vi.fn();

beforeAll(async () => {
  class MockApplicationV2 {
    readonly element = controls().root;
    closed = false;
    rendered = false;

    constructor(_options?: object) {}

    async close(): Promise<this> {
      this.closed = true;
      this.rendered = false;
      return this;
    }

    protected _attachPartListeners(
      _partId: string,
      _root: object,
      _options: object,
    ): void {}
  }

  vi.stubGlobal("HTMLInputElement", MockInput);
  vi.stubGlobal("foundry", {
    applications: {
      api: {
        ApplicationV2: MockApplicationV2,
        HandlebarsApplicationMixin: <T>(Base: T): T => Base,
      },
    },
  });
  vi.stubGlobal("game", {
    user: { id: "user" },
    i18n: { localize: (key: string) => key },
  });
  vi.stubGlobal("ui", { notifications: { error: notificationError } });

  const module = await import("./agent-sheet-settings");
  AgentSheetSettingsClass = module.AgentSheetSettings as unknown as typeof AgentSheetSettingsClass;
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => notificationError.mockClear());

function actor(options?: {
  readonly accentColor?: string;
  readonly profileColor?: string;
  readonly editable?: boolean;
  readonly updateError?: Error;
}) {
  const system = options?.accentColor
    ? { appearance: { accentColor: options.accentColor } }
    : { appearance: {} };
  const value = {
    system,
    getEmbeddedCollection: vi.fn(() =>
      options?.profileColor
        ? [{ type: "profile", system: { accentColor: options.profileColor } }]
        : [],
    ),
    canUserModify: vi.fn(() => options?.editable ?? true),
    update: vi.fn(async (update: Record<string, unknown>) => {
      if (options?.updateError) throw options.updateError;
      (system.appearance as { accentColor?: unknown }).accentColor =
        update["system.appearance.accentColor"];
      return value;
    }),
  };
  return value;
}

describe("AgentSheetSettings", () => {
  it("starts with the effective Agent accent", async () => {
    const settings = new AgentSheetSettingsClass(
      actor({ profileColor: "#4176BA" }),
    );

    await expect(settings._prepareContext({})).resolves.toEqual({
      accentColor: "#4176BA",
    });
  });

  it("keeps picker, valid hexadecimal and preview synchronized", () => {
    const settings = new AgentSheetSettingsClass(actor());
    const ui = controls();
    settings._attachPartListeners("main", ui.root, {});

    ui.hexadecimal.value = "#4176ba";
    ui.hexadecimal.dispatch("input");
    expect(ui.picker.value).toBe("#4176BA");
    expect(ui.preview.style.backgroundColor).toBe("#4176BA");

    ui.picker.value = "#ae2c12";
    ui.picker.dispatch("input");
    expect(ui.hexadecimal.value).toBe("#AE2C12");
    expect(ui.preview.style.backgroundColor).toBe("#AE2C12");
  });

  it("restores the current Profile default only in the draft", async () => {
    const configured = actor({
      accentColor: "#123456",
      profileColor: "#4B7E2F",
    });
    const settings = new AgentSheetSettingsClass(configured);

    await AgentSheetSettingsClass.DEFAULT_OPTIONS.actions.restoreDefault.call(
      settings,
    );

    await expect(settings._prepareContext({})).resolves.toEqual({
      accentColor: "#4B7E2F",
    });
    expect(configured.update).not.toHaveBeenCalled();
  });

  it("restores the system red when there is no Profile", async () => {
    const settings = new AgentSheetSettingsClass(
      actor({ accentColor: "#123456" }),
    );

    await AgentSheetSettingsClass.DEFAULT_OPTIONS.actions.restoreDefault.call(
      settings,
    );

    await expect(settings._prepareContext({})).resolves.toEqual({
      accentColor: "#7F252B",
    });
  });

  it("rejects invalid input and saves a canonical valid color", async () => {
    const configured = actor();
    const settings = new AgentSheetSettingsClass(configured);
    const preventDefault = vi.fn();
    const field = new MockInput("red");
    const form = { elements: { namedItem: vi.fn(() => field) } };

    await AgentSheetSettingsClass.DEFAULT_OPTIONS.form.handler.call(
      settings,
      { preventDefault },
      form,
      {},
    );
    expect(configured.update).not.toHaveBeenCalled();
    expect(notificationError).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.AgentSheet.Settings.Errors.InvalidColor",
    );
    expect(settings.closed).toBe(false);

    field.value = "#ae2c12";
    await AgentSheetSettingsClass.DEFAULT_OPTIONS.form.handler.call(
      settings,
      { preventDefault },
      form,
      {},
    );
    expect(configured.update).toHaveBeenCalledWith({
      "system.appearance.accentColor": "#AE2C12",
    });
    expect(settings.closed).toBe(true);
  });

  it("keeps the application open when permission or persistence fails", async () => {
    const preventDefault = vi.fn();
    const field = new MockInput("#4176BA");
    const form = { elements: { namedItem: vi.fn(() => field) } };
    const forbiddenActor = actor({ editable: false });
    const forbidden = new AgentSheetSettingsClass(forbiddenActor);

    await AgentSheetSettingsClass.DEFAULT_OPTIONS.form.handler.call(
      forbidden,
      { preventDefault },
      form,
      {},
    );
    expect(forbiddenActor.update).not.toHaveBeenCalled();
    expect(forbidden.closed).toBe(false);

    const failing = new AgentSheetSettingsClass(
      actor({ updateError: new Error("database unavailable") }),
    );
    await AgentSheetSettingsClass.DEFAULT_OPTIONS.form.handler.call(
      failing,
      { preventDefault },
      form,
      {},
    );
    expect(failing.closed).toBe(false);
    expect(notificationError).toHaveBeenLastCalledWith(
      "ORDEMPARANORMAL2.AgentSheet.Settings.Errors.SaveFailed",
    );
  });

  it("cancels without persisting", async () => {
    const configured = actor();
    const settings = new AgentSheetSettingsClass(configured);

    await AgentSheetSettingsClass.DEFAULT_OPTIONS.actions.cancel.call(settings);

    expect(configured.update).not.toHaveBeenCalled();
    expect(settings.closed).toBe(true);
  });
});
