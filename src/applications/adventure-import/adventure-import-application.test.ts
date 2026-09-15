import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Slot = "pdf" | "actOne" | "actTwo";

class MockFileInput {
  readonly dataset: { fileSlot: Slot };
  readonly click = vi.fn();
  files: FileList | null = null;
  readonly changeListeners: (() => void)[] = [];

  constructor(slot: Slot) {
    this.dataset = { fileSlot: slot };
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "change") this.changeListeners.push(listener);
  }

  select(file: File | null): void {
    this.files = file ? { 0: file, length: 1 } as unknown as FileList : null;
    for (const listener of this.changeListeners) listener();
  }
}

const instances: MockApplicationV2[] = [];
let onRender: ((application: MockApplicationV2) => Promise<void>) | null = null;

class MockApplicationV2 {
  readonly inputs: Record<Slot, MockFileInput> = {
    pdf: new MockFileInput("pdf"),
    actOne: new MockFileInput("actOne"),
    actTwo: new MockFileInput("actTwo"),
  };
  readonly element = {
    querySelector: vi.fn((selector: string) => {
      const slot = selector.match(/data-file-slot='([^']+)'/)?.[1];
      return slot === "pdf" || slot === "actOne" || slot === "actTwo"
        ? this.inputs[slot]
        : null;
    }),
    querySelectorAll: vi.fn(() => Object.values(this.inputs)),
  };
  readonly render = vi.fn(async () => {
    await onRender?.(this);
    return this;
  });
  readonly bringToFront = vi.fn();
  readonly listeners = new Map<string, ((event: Event) => void)[]>();

  constructor() { instances.push(this); }
  protected _canRender(): boolean { return true; }
  protected _attachPartListeners(): void {}

  addEventListener(type: string, listener: (event: Event) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  emitClose(): void {
    for (const listener of this.listeners.get("close") ?? []) listener(new Event("close"));
    this.listeners.delete("close");
  }
}

interface TestContext {
  pdfName: string;
  actOneName: string;
  actTwoName: string;
  canAnalyze: boolean;
  hasPreview: boolean;
  preview: readonly { label: string; count: number }[];
}

interface TestApplication {
  inputs: Record<Slot, MockFileInput>;
  element: MockApplicationV2["element"];
  render: MockApplicationV2["render"];
  _canRender(options: object): boolean;
  _prepareContext(): Promise<TestContext>;
  _attachPartListeners(partId: string, htmlElement: object, options: object): void;
}

type TestAction = (this: TestApplication, event: PointerEvent, target: HTMLElement) => void | Promise<void>;
let module: typeof import("./adventure-import-application");
let Application: {
  new (): TestApplication;
  DEFAULT_OPTIONS: { actions: Record<string, TestAction>; position: object; window: object };
  PARTS: object;
};
const info = vi.fn();
const settingsSet = vi.fn();
const documentCreate = vi.fn();

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    applications: { api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: <T>(Base: T): T => Base,
    } },
  });
  vi.stubGlobal("ui", { notifications: { info } });
  vi.stubGlobal("Actor", { create: documentCreate });
  vi.stubGlobal("Item", { create: documentCreate });
  vi.stubGlobal("game", {
    user: { isGM: true },
    i18n: { localize: (key: string) => key },
    settings: { set: settingsSet },
  });
  module = await import("./adventure-import-application");
  Application = module.AdventureImportApplication as unknown as typeof Application;
});

beforeEach(() => {
  vi.stubGlobal("game", {
    user: { isGM: true },
    i18n: { localize: (key: string) => key },
    settings: { set: settingsSet },
  });
  for (const app of instances) app.emitClose();
  instances.length = 0;
  onRender = null;
  info.mockClear();
  settingsSet.mockClear();
  documentCreate.mockClear();
});

afterAll(() => vi.unstubAllGlobals());

function file(name: string): File & { arrayBuffer: ReturnType<typeof vi.fn>; text: ReturnType<typeof vi.fn> } {
  return {
    name,
    arrayBuffer: vi.fn(async () => { throw new Error("File was read."); }),
    text: vi.fn(async () => { throw new Error("File was read."); }),
  } as unknown as File & { arrayBuffer: ReturnType<typeof vi.fn>; text: ReturnType<typeof vi.fn> };
}

function attach(app: TestApplication): void {
  app._attachPartListeners("main", app.element, {});
}

function action(app: TestApplication, name: string, slot?: Slot): Promise<void> {
  const target = { dataset: slot ? { fileSlot: slot } : {} } as HTMLElement;
  return Promise.resolve(Application.DEFAULT_OPTIONS.actions[name].call(app, {} as PointerEvent, target));
}

describe("Adventure Import Application", () => {
  it("keeps native window options and GM-only access", () => {
    expect(Application.DEFAULT_OPTIONS.position).toEqual({ width: 800, height: "auto" });
    expect(Application.DEFAULT_OPTIONS.window).toMatchObject({
      title: "ORDEMPARANORMAL2.AdventureImport.Title", resizable: true,
    });
    expect(Application.PARTS).toHaveProperty("main");
    const app = new Application();
    expect(app._canRender({})).toBe(true);
    vi.stubGlobal("game", { user: { isGM: false } });
    expect(app._canRender({})).toBe(false);
  });

  it("reuses one window and reopens after close or failed render", async () => {
    await module.openAdventureImporter();
    await module.openAdventureImporter();
    expect(instances).toHaveLength(1);
    expect(instances[0].render).toHaveBeenCalledExactlyOnceWith({ force: true });
    expect(instances[0].bringToFront).toHaveBeenCalledOnce();
    instances[0].emitClose();
    onRender = async () => { throw new Error("render failed"); };
    await expect(module.openAdventureImporter()).rejects.toThrow("render failed");
    onRender = null;
    await module.openAdventureImporter();
    expect(instances).toHaveLength(3);
  });

  it("registers the window before concurrent renders and blocks non-GMs", async () => {
    let release: (() => void) | null = null;
    onRender = () => new Promise<void>(resolve => { release = resolve; });
    const first = module.openAdventureImporter();
    const second = module.openAdventureImporter();
    expect(instances).toHaveLength(1);
    if (!release) throw new Error("Render did not start.");
    (release as () => void)();
    await Promise.all([first, second]);
    expect(instances[0].bringToFront).toHaveBeenCalledOnce();
    instances[0].emitClose();
    instances.length = 0;
    vi.stubGlobal("game", { user: { isGM: false } });
    await module.openAdventureImporter();
    expect(instances).toHaveLength(0);
  });

  it("selects and replaces the PDF in memory without reading it", async () => {
    const app = new Application();
    attach(app);
    expect((await app._prepareContext()).canAnalyze).toBe(false);
    await action(app, "selectPdf");
    expect(app.inputs.pdf.click).toHaveBeenCalledOnce();
    const first = file("primeiro.pdf");
    app.inputs.pdf.select(first);
    expect(await app._prepareContext()).toMatchObject({ pdfName: "primeiro.pdf", canAnalyze: true });
    const second = file("segundo.pdf");
    app.inputs.pdf.select(second);
    expect((await app._prepareContext()).pdfName).toBe("segundo.pdf");
    app.inputs.pdf.select(null);
    expect((await app._prepareContext()).pdfName).toBe("segundo.pdf");
    expect(first.arrayBuffer).not.toHaveBeenCalled();
    expect(first.text).not.toHaveBeenCalled();
    expect(second.arrayBuffer).not.toHaveBeenCalled();
    expect(second.text).not.toHaveBeenCalled();
    expect((await new Application()._prepareContext()).pdfName).toBe("");
    expect(settingsSet).not.toHaveBeenCalled();
  });

  it("selects the two ZIPs independently and keeps the other ZIP on replacement", async () => {
    const app = new Application();
    attach(app);
    await action(app, "selectZip", "actOne");
    await action(app, "selectZip", "actTwo");
    expect(app.inputs.actOne.click).toHaveBeenCalledOnce();
    expect(app.inputs.actTwo.click).toHaveBeenCalledOnce();
    const one = file("ato-um.zip");
    const two = file("ato-dois.zip");
    app.inputs.actOne.select(one);
    app.inputs.actTwo.select(two);
    expect(await app._prepareContext()).toMatchObject({
      actOneName: "ato-um.zip", actTwoName: "ato-dois.zip", canAnalyze: false,
    });
    app.inputs.actOne.select(file("ato-um-novo.zip"));
    expect(await app._prepareContext()).toMatchObject({
      actOneName: "ato-um-novo.zip", actTwoName: "ato-dois.zip",
    });
    expect(one.arrayBuffer).not.toHaveBeenCalled();
    expect(two.arrayBuffer).not.toHaveBeenCalled();
  });

  it("shows mock analysis only after selecting a PDF and clears stale preview", async () => {
    const app = new Application();
    attach(app);
    await action(app, "analyzeFiles");
    expect((await app._prepareContext()).hasPreview).toBe(false);
    const pdf = file("playtest.pdf");
    app.inputs.pdf.select(pdf);
    await action(app, "analyzeFiles");
    const result = await app._prepareContext();
    expect(result.hasPreview).toBe(true);
    expect(result.preview).toHaveLength(5);
    expect(result.preview.map(entry => entry.count)).toEqual([12, 86, 14, 9, 28]);
    expect(pdf.arrayBuffer).not.toHaveBeenCalled();
    expect(pdf.text).not.toHaveBeenCalled();
    app.inputs.actOne.select(file("ato-um.zip"));
    expect((await app._prepareContext()).hasPreview).toBe(false);
  });

  it("never mutates the World when the visible import action is clicked", async () => {
    const app = new Application();
    attach(app);
    await action(app, "importPreview");
    expect(info).not.toHaveBeenCalled();
    app.inputs.pdf.select(file("playtest.pdf"));
    await action(app, "analyzeFiles");
    await action(app, "importPreview");
    expect(info).toHaveBeenCalledExactlyOnceWith(
      "ORDEMPARANORMAL2.AdventureImport.MockPreview.NoImport",
    );
    expect(settingsSet).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
  });
});

describe("Adventure Import prototype template and styles", () => {
  it("renders names, empty state, and mock preview for two acts", async () => {
    const template = await readFile(
      fileURLToPath(new URL("../../../templates/applications/adventure-import.hbs", import.meta.url)), "utf8",
    );
    const hb = Handlebars.create();
    hb.registerHelper("localize", (key: string) => key);
    const render = hb.compile(template);
    const app = new Application();
    attach(app);
    const empty = render(await app._prepareContext());
    expect(empty).toContain("AdventureImport.EmptyContent");
    expect(empty.match(/AdventureImport\.EmptyFile/g)).toHaveLength(3);
    expect(empty).toMatch(/data-action="analyzeFiles"\s+disabled/);
    expect(empty).toMatch(/data-action="importPreview"\s+disabled/);
    app.inputs.pdf.select(file("A&B.pdf"));
    app.inputs.actOne.select(file("ato-um.zip"));
    const selected = render(await app._prepareContext());
    expect(selected).toContain("A&amp;B.pdf");
    expect(selected).toContain("ato-um.zip");
    expect(selected).toContain("op2-adventure-import__selection-check");
    expect(selected).not.toMatch(/data-action="analyzeFiles"\s+disabled/);
    await action(app, "analyzeFiles");
    const analyzed = render(await app._prepareContext());
    expect(analyzed.match(/op2-adventure-import__mock-entry/g)).toHaveLength(5);
    expect(analyzed).toContain("AdventureImport.MockPreview.Characters");
    expect(analyzed).not.toContain("AdventureImport.EmptyContent");
    expect(analyzed).not.toMatch(/data-action="importPreview"\s+disabled/);
    expect(template.match(/AdventureImport\.Act(?:One|Two)/g)).toHaveLength(2);
  });

  it("uses three local inputs and keeps CSS off native header buttons", async () => {
    const [source, template, css, manifestText, localeText] = await Promise.all([
      readFile(fileURLToPath(new URL("./adventure-import-application.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../templates/applications/adventure-import.hbs", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../styles/adventure-import.css", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../system.json", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url)), "utf8"),
    ]);
    const inputs = [...template.matchAll(/<input\b[^>]*>/g)].map(match => match[0]);
    expect(inputs).toHaveLength(3);
    expect(inputs.every(input => /\bhidden\b/.test(input))).toBe(true);
    expect(inputs.map(input => input.match(/accept="([^"]+)"/)?.[1])).toEqual([".pdf", ".zip", ".zip"]);
    expect((JSON.parse(manifestText) as { styles: string[] }).styles).toContain("styles/adventure-import.css");
    expect(css).toContain(".op2-adventure-import__body button");
    expect(css).not.toMatch(/\.ordemparanormal2\.op2-adventure-import\s+button(?:\s|:|\{)/);
    expect(source).not.toMatch(/_getHeaderControls|FileReader|arrayBuffer\(|\.text\(|\.create\(|settings\.set|localStorage/);
    expect(css).toContain("max-height: calc(100dvh - 24px)");
    expect(css).toContain("container-type: inline-size");
    const locale = JSON.parse(localeText) as Record<string, unknown>;
    for (const [, key] of template.matchAll(/localize "([^"]+)"/g)) {
      const value = key.split(".").reduce<unknown>((current, segment) =>
        typeof current === "object" && current !== null
          ? (current as Record<string, unknown>)[segment]
          : undefined,
        locale,
      );
      expect(value, key).toEqual(expect.any(String));
    }
  });
});
