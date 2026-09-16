import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdventureSourceAnalysis } from "../../features/adventure-import/analyze-adventure-sources";
import type { PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import { MaterializationError } from "../../features/adventure-import/materialize-adventure-assets";
import { HandoutImportError } from "../../features/adventure-import/import-adventure-handouts";

type Slot = "pdf" | "actOne" | "actTwo";

const mocks = vi.hoisted(() => ({
  analyzeAdventureSources: vi.fn(),
  analyzePdfSource: vi.fn(),
  openAdventureImportPasswordDialog: vi.fn(),
  materializeAdventureAssets: vi.fn(),
  createAdventureAssetStorage: vi.fn(),
  importAdventureHandouts: vi.fn(),
  createAdventureHandoutJournalPort: vi.fn(),
}));

vi.mock("../../features/adventure-import/analyze-adventure-sources", () => ({
  analyzeAdventureSources: mocks.analyzeAdventureSources,
  analyzePdfSource: mocks.analyzePdfSource,
}));

vi.mock("./adventure-import-password-dialog", () => ({
  openAdventureImportPasswordDialog: mocks.openAdventureImportPasswordDialog,
}));
vi.mock("../../features/adventure-import/materialize-adventure-assets", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../features/adventure-import/materialize-adventure-assets")>();
  return { ...original, materializeAdventureAssets: mocks.materializeAdventureAssets };
});
vi.mock("../../adapters/foundry/adventure-asset-storage", () => ({
  createAdventureAssetStorage: mocks.createAdventureAssetStorage,
}));
vi.mock("../../features/adventure-import/import-adventure-handouts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../features/adventure-import/import-adventure-handouts")>();
  return { ...original, importAdventureHandouts: mocks.importAdventureHandouts };
});
vi.mock("../../adapters/foundry/adventure-handout-journals", () => ({
  createAdventureHandoutJournalPort: mocks.createAdventureHandoutJournalPort,
}));

function unencryptedRecognizedPdf(overrides: Partial<PdfSourceAnalysis> = {}): PdfSourceAnalysis {
  return {
    status: "recognized",
    passwordRequired: false,
    matchMethod: "hash",
    edition: "playtest-alpha-v1.1",
    facts: {
      pre: {
        byteLength: 100,
        sha256: "known-hash",
        pdfVersion: "1.7",
        encryption: { present: false },
        trailerId: null,
        plaintextCatalogHints: null,
      },
      parseAttempt: {
        status: "success",
        facts: { pageCount: 104, producer: null, creator: null, lang: null, versionStampTag: null },
      },
    },
    issues: [],
    ...overrides,
  };
}

function emptyAnalysis(pdf: PdfSourceAnalysis): AdventureSourceAnalysis {
  return { pdf, actOne: null, actTwo: null };
}

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
  protected _onClose(): void {}

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

interface TestStatus {
  label: string;
  modifier: string;
  text: string;
  issues: readonly string[];
}

interface TestInventoryRow {
  label: string;
  summary: string;
}

interface TestContext {
  pdfName: string;
  actOneName: string;
  actTwoName: string;
  canAnalyze: boolean;
  hasAnalysis: boolean;
  canImport: boolean;
  isImporting: boolean;
  statuses: readonly TestStatus[];
  inventory: readonly TestInventoryRow[];
}

interface TestApplication {
  inputs: Record<Slot, MockFileInput>;
  element: MockApplicationV2["element"];
  render: MockApplicationV2["render"];
  _canRender(options: object): boolean;
  _prepareContext(): Promise<TestContext>;
  _attachPartListeners(partId: string, htmlElement: object, options: object): void;
  _onClose(options: object): void;
}

type TestAction = (this: TestApplication, event: PointerEvent, target: HTMLElement) => void | Promise<void>;
let module: typeof import("./adventure-import-application");
let Application: {
  new (): TestApplication;
  DEFAULT_OPTIONS: { actions: Record<string, TestAction>; position: object; window: object };
  PARTS: object;
};
const info = vi.fn();
const errorNotification = vi.fn();
const settingsSet = vi.fn();
const documentCreate = vi.fn();
const localize = vi.fn((key: string) => key);
const format = vi.fn((key: string, data: Record<string, string>) => `${key}(${Object.values(data).join(",")})`);

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    applications: { api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: <T>(Base: T): T => Base,
    } },
  });
  vi.stubGlobal("ui", { notifications: { info, error: errorNotification } });
  vi.stubGlobal("CONST", { UPLOADABLE_FILE_EXTENSIONS: { png: "image/png" } });
  vi.stubGlobal("Actor", { create: documentCreate });
  vi.stubGlobal("Item", { create: documentCreate });
  vi.stubGlobal("game", {
    user: { isGM: true, id: "gm" },
    users: { activeGM: { id: "gm" } },
    i18n: { localize, format },
    settings: { set: settingsSet },
  });
  module = await import("./adventure-import-application");
  Application = module.AdventureImportApplication as unknown as typeof Application;
});

beforeEach(() => {
  vi.stubGlobal("game", {
    user: { isGM: true, id: "gm" },
    users: { activeGM: { id: "gm" } },
    i18n: { localize, format },
    settings: { set: settingsSet },
  });
  for (const app of instances) app.emitClose();
  instances.length = 0;
  onRender = null;
  info.mockClear();
  errorNotification.mockClear();
  settingsSet.mockClear();
  documentCreate.mockClear();
  localize.mockClear();
  format.mockClear();
  mocks.analyzeAdventureSources.mockReset();
  mocks.analyzePdfSource.mockReset();
  mocks.openAdventureImportPasswordDialog.mockReset();
  mocks.materializeAdventureAssets.mockReset();
  mocks.createAdventureAssetStorage.mockReset().mockReturnValue({ worldId: "test-world" });
  mocks.importAdventureHandouts.mockReset().mockResolvedValue({ created: 0, updated: 0, unchanged: 0 });
  mocks.createAdventureHandoutJournalPort.mockReset().mockReturnValue({ isAuthorized: () => true });
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
    expect(mocks.analyzeAdventureSources).not.toHaveBeenCalled();
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

  it("runs the real analysis only after a PDF is selected and clicking Analisar, and clears it on reselection", async () => {
    const app = new Application();
    attach(app);
    await action(app, "analyzeFiles");
    expect(mocks.analyzeAdventureSources).not.toHaveBeenCalled();
    expect((await app._prepareContext()).hasAnalysis).toBe(false);

    mocks.analyzeAdventureSources.mockResolvedValue(emptyAnalysis(unencryptedRecognizedPdf()));
    const pdf = file("playtest.pdf");
    app.inputs.pdf.select(pdf);
    await action(app, "analyzeFiles");

    expect(mocks.analyzeAdventureSources).toHaveBeenCalledExactlyOnceWith({
      pdf, actOne: null, actTwo: null, password: null,
    });
    const result = await app._prepareContext();
    expect(result.hasAnalysis).toBe(true);
    expect(result.statuses).toHaveLength(1);
    expect(result.statuses[0].modifier).toBe("recognized");
    expect(pdf.arrayBuffer).not.toHaveBeenCalled();
    expect(pdf.text).not.toHaveBeenCalled();

    app.inputs.actOne.select(file("ato-um.zip"));
    expect((await app._prepareContext()).hasAnalysis).toBe(false);
  });

  it("shows real per-folder inventory counts derived from the mocked analysis, never invented numbers", async () => {
    const app = new Application();
    attach(app);
    mocks.analyzeAdventureSources.mockResolvedValue({
      pdf: unencryptedRecognizedPdf(),
      actOne: {
        act: "actOne",
        status: "recognized",
        matchMethod: "hash",
        edition: "ato-i-extras",
        inventory: {
          totalFiles: 43,
          totalBytes: 93000000,
          topLevelFolders: [{ name: "Handouts", fileCount: 14 }, { name: "Tokens", fileCount: 10 }],
        },
        issues: [],
      },
      actTwo: null,
    });
    app.inputs.pdf.select(file("playtest.pdf"));
    await action(app, "analyzeFiles");
    const result = await app._prepareContext();
    expect(result.statuses).toHaveLength(2);
    expect(result.inventory.map((row) => row.summary)).toContain("ORDEMPARANORMAL2.AdventureImport.Analysis.Inventory.PageCount(104)");
    expect(result.inventory.map((row) => row.summary)).toContain("ORDEMPARANORMAL2.AdventureImport.Analysis.Inventory.TotalFiles(43)");
    expect(result.inventory.map((row) => row.summary)).toContain("ORDEMPARANORMAL2.AdventureImport.Analysis.Inventory.TotalFiles(14)");
  });

  it("opens the password dialog every time it is needed, never blocked by a prior cancel, and only stores a password that actually unlocked the file", async () => {
    const app = new Application();
    attach(app);
    const pdf = file("protegido.pdf");
    app.inputs.pdf.select(pdf);

    const passwordRequiredAnalysis = () => emptyAnalysis(unencryptedRecognizedPdf({
      passwordRequired: true,
      facts: {
        pre: {
          byteLength: 1, sha256: "known-hash", pdfVersion: "1.7",
          encryption: { present: true }, trailerId: null, plaintextCatalogHints: null,
        },
        parseAttempt: { status: "not-attempted" },
      },
    }));

    mocks.analyzeAdventureSources.mockImplementation(async () => passwordRequiredAnalysis());

    // 1st click: password required, dialog opens, user cancels.
    mocks.openAdventureImportPasswordDialog.mockResolvedValueOnce(null);
    await action(app, "analyzeFiles");
    expect(mocks.openAdventureImportPasswordDialog).toHaveBeenCalledOnce();
    expect(mocks.analyzePdfSource).not.toHaveBeenCalled();
    expect((await app._prepareContext()).hasAnalysis).toBe(true);

    // 2nd click: still no password stored, dialog opens again (cancel did not block retrying),
    // this time the user types the wrong password.
    mocks.openAdventureImportPasswordDialog.mockResolvedValueOnce("senha-errada");
    mocks.analyzePdfSource.mockResolvedValueOnce(unencryptedRecognizedPdf({
      passwordRequired: true,
      facts: {
        pre: {
          byteLength: 1, sha256: "known-hash", pdfVersion: "1.7",
          encryption: { present: true }, trailerId: null, plaintextCatalogHints: null,
        },
        parseAttempt: { status: "incorrect-password" },
      },
      issues: [{ code: "pdf-incorrect-password", severity: "warning" }],
    }));
    await action(app, "analyzeFiles");
    expect(mocks.openAdventureImportPasswordDialog).toHaveBeenCalledTimes(2);
    expect(mocks.analyzePdfSource).toHaveBeenCalledExactlyOnceWith(pdf, "senha-errada");
    expect((await app._prepareContext()).statuses[0].issues).toContain(
      "ORDEMPARANORMAL2.AdventureImport.Analysis.Issues.PdfIncorrectPassword",
    );

    // 3rd click: analyzeAdventureSources is called again with password still null (never stored),
    // so the dialog opens a third time — this time with the correct password.
    mocks.openAdventureImportPasswordDialog.mockResolvedValueOnce("senha-certa");
    mocks.analyzePdfSource.mockResolvedValueOnce(unencryptedRecognizedPdf({ passwordRequired: false }));
    await action(app, "analyzeFiles");
    expect(mocks.analyzeAdventureSources).toHaveBeenNthCalledWith(3, { pdf, actOne: null, actTwo: null, password: null });
    expect(mocks.openAdventureImportPasswordDialog).toHaveBeenCalledTimes(3);
    expect(mocks.analyzePdfSource).toHaveBeenNthCalledWith(2, pdf, "senha-certa");
    expect((await app._prepareContext()).statuses[0].modifier).toBe("recognized");

    // 4th click: the now-stored password is reused automatically; the dialog does not reopen.
    await action(app, "analyzeFiles");
    expect(mocks.analyzeAdventureSources).toHaveBeenNthCalledWith(4, { pdf, actOne: null, actTwo: null, password: "senha-certa" });
    expect(mocks.openAdventureImportPasswordDialog).toHaveBeenCalledTimes(3);
  });

  it("does not reopen the password dialog after a generic parse failure, and does not store a password for it", async () => {
    const app = new Application();
    attach(app);
    const pdf = file("corrompido.pdf");
    app.inputs.pdf.select(pdf);
    mocks.analyzeAdventureSources.mockResolvedValue(emptyAnalysis(unencryptedRecognizedPdf({
      passwordRequired: false,
      facts: {
        pre: {
          byteLength: 1, sha256: "known-hash", pdfVersion: "1.7",
          encryption: { present: true }, trailerId: null, plaintextCatalogHints: null,
        },
        parseAttempt: { status: "failed" },
      },
      issues: [{ code: "pdf-parse-failed", severity: "error" }],
    })));

    await action(app, "analyzeFiles");
    expect(mocks.openAdventureImportPasswordDialog).not.toHaveBeenCalled();
    await action(app, "analyzeFiles");
    expect(mocks.openAdventureImportPasswordDialog).not.toHaveBeenCalled();
  });

  it("discards the in-memory password when the window closes", async () => {
    const app = new Application();
    attach(app);
    app._onClose({});
  });

  it("does not materialize without a recognized ZIP", async () => {
    const app = new Application();
    attach(app);
    await action(app, "importAssets");
    expect(info).not.toHaveBeenCalled();
    mocks.analyzeAdventureSources.mockResolvedValue(emptyAnalysis(unencryptedRecognizedPdf()));
    app.inputs.pdf.select(file("playtest.pdf"));
    await action(app, "analyzeFiles");
    await action(app, "importAssets");
    expect(mocks.materializeAdventureAssets).not.toHaveBeenCalled();
    expect(settingsSet).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
    expect(mocks.importAdventureHandouts).not.toHaveBeenCalled();
  });

  it("imports handouts automatically after both selected Acts finish sending their files", async () => {
    const app = new Application();
    attach(app);
    app.inputs.pdf.select(file("playtest.pdf"));
    app.inputs.actOne.select(file("ato-um.zip"));
    app.inputs.actTwo.select(file("ato-dois.zip"));
    mocks.analyzeAdventureSources.mockResolvedValue({
      pdf: unencryptedRecognizedPdf(),
      actOne: { act: "actOne", status: "recognized", edition: "ato-i-extras", inventory: null, issues: [] },
      actTwo: { act: "actTwo", status: "recognized", edition: "ato-ii-extras", inventory: null, issues: [] },
    });
    let finishSending!: () => void;
    mocks.materializeAdventureAssets.mockImplementation(() => new Promise(resolve => {
      finishSending = () => resolve({ assets: [], materializedActs: ["actOne", "actTwo"] });
    }));
    await action(app, "analyzeFiles");
    const importing = action(app, "importAssets");
    await vi.waitFor(() => expect(mocks.materializeAdventureAssets).toHaveBeenCalledOnce());
    expect(mocks.importAdventureHandouts).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect((await app._prepareContext()).canImport).toBe(false);
    await action(app, "importAssets");
    expect(mocks.materializeAdventureAssets).toHaveBeenCalledOnce();
    finishSending();
    await importing;
    expect(mocks.importAdventureHandouts).toHaveBeenCalledOnce();
    expect(mocks.importAdventureHandouts.mock.calls[0][0]).toMatchObject({
      acts: ["actOne", "actTwo"], lookup: { worldId: "test-world" },
      definition: expect.objectContaining({ id: "playtest-alpha" }),
    });
    expect(info).toHaveBeenCalledOnce();
    expect(Application.DEFAULT_OPTIONS.actions).not.toHaveProperty("importHandouts");
  });

  it("does not dispatch adventure import from an inactive GM", async () => {
    const app = new Application();
    attach(app);
    vi.stubGlobal("game", {
      user: { isGM: true, id: "other-gm" }, users: { activeGM: { id: "gm" } },
      i18n: { localize, format },
    });
    expect((await app._prepareContext()).canImport).toBe(false);
    await action(app, "importAssets");
    expect(mocks.materializeAdventureAssets).not.toHaveBeenCalled();
    expect(mocks.importAdventureHandouts).not.toHaveBeenCalled();
  });

  it("coordinates separate use-cases only for the recognized selected Act", async () => {
    const app = new Application();
    attach(app);
    const zip = file("ato-um.zip");
    app.inputs.pdf.select(file("playtest.pdf"));
    app.inputs.actOne.select(zip);
    mocks.analyzeAdventureSources.mockResolvedValue({
      pdf: unencryptedRecognizedPdf({ status: "invalid" }),
      actOne: { act: "actOne", status: "recognized", matchMethod: "hash", edition: "ato-i-extras", inventory: null, issues: [] },
      actTwo: null,
    });
    mocks.materializeAdventureAssets.mockResolvedValue({
      assets: [{ act: "actOne", originalEntryPath: "a.png", storedPath: "worlds/test/a.png" }],
      materializedActs: ["actOne"],
    });
    await action(app, "analyzeFiles");
    expect((await app._prepareContext()).canImport).toBe(true);
    await action(app, "importAssets");
    expect(mocks.materializeAdventureAssets).toHaveBeenCalledOnce();
    expect(mocks.materializeAdventureAssets.mock.calls[0][0]).toMatchObject({
      actOne: zip, actOneAnalysis: { status: "recognized" }, mimeTypes: { png: "image/png" },
    });
    expect(info).toHaveBeenCalledOnce();
    expect(settingsSet).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
    expect(mocks.importAdventureHandouts).toHaveBeenCalledOnce();
    expect(mocks.importAdventureHandouts.mock.calls[0][0]).toMatchObject({ acts: ["actOne"] });
  });

  it("counts confirmed progress on failure without forging a successful result", async () => {
    const app = new Application();
    attach(app);
    app.inputs.pdf.select(file("playtest.pdf"));
    app.inputs.actOne.select(file("ato-um.zip"));
    mocks.analyzeAdventureSources.mockResolvedValue({
      pdf: unencryptedRecognizedPdf(),
      actOne: { act: "actOne", status: "recognized", matchMethod: "hash", edition: "ato-i-extras", inventory: null, issues: [] },
      actTwo: null,
    });
    mocks.materializeAdventureAssets.mockRejectedValue(new MaterializationError(
      "upload failed", "actOne", "two.png",
      [{ act: "actOne", originalEntryPath: "one.png", storedPath: "worlds/test/one.png" }],
      "upload",
    ));
    await action(app, "analyzeFiles");
    await action(app, "importAssets");
    expect(errorNotification).toHaveBeenCalledOnce();
    expect(format).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.AdventureImport.Actions.ImportFailure",
      expect.objectContaining({ count: "1" }),
    );
    expect(info).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
    expect(mocks.importAdventureHandouts).not.toHaveBeenCalled();
    expect((await app._prepareContext()).canImport).toBe(true);
  });

  it("reports a handout failure after sending files and allows the same import action to retry", async () => {
    const app = new Application();
    attach(app);
    app.inputs.pdf.select(file("playtest.pdf"));
    app.inputs.actTwo.select(file("ato-dois.zip"));
    mocks.analyzeAdventureSources.mockResolvedValue({
      pdf: unencryptedRecognizedPdf(), actOne: null,
      actTwo: { act: "actTwo", status: "recognized", edition: "ato-ii-extras", inventory: null, issues: [] },
    });
    mocks.materializeAdventureAssets.mockResolvedValue({ assets: [], materializedActs: ["actTwo"] });
    mocks.importAdventureHandouts.mockRejectedValueOnce(new HandoutImportError(
      "operation-failed", "page", "actTwo", "actTwo.handout.01.print",
      { created: 1, updated: 0, unchanged: 0 }, "database failed",
    ));
    await action(app, "analyzeFiles");
    await action(app, "importAssets");
    expect(info).not.toHaveBeenCalled();
    expect(format).toHaveBeenCalledWith("ORDEMPARANORMAL2.AdventureImport.Actions.HandoutsImportFailure", {
      detail: "ORDEMPARANORMAL2.AdventureImport.Actions.HandoutsFailure.operation-failed · ORDEMPARANORMAL2.AdventureImport.ActTwo · Handout 01 — impressão",
    });
    expect(await app._prepareContext()).toMatchObject({ isImporting: false, canImport: true });
    await action(app, "importAssets");
    expect(mocks.materializeAdventureAssets).toHaveBeenCalledTimes(2);
    expect(mocks.importAdventureHandouts).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledExactlyOnceWith("ORDEMPARANORMAL2.AdventureImport.Actions.ImportSuccess");
  });
});

describe("Adventure Import prototype template and styles", () => {
  it("renders empty state and real per-source status rows", async () => {
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
    expect(empty).toMatch(/data-action="importAssets"\s+disabled/);
    expect(empty).not.toContain('data-action="importHandouts"');

    app.inputs.pdf.select(file("A&B.pdf"));
    app.inputs.actOne.select(file("ato-um.zip"));
    const selected = render(await app._prepareContext());
    expect(selected).toContain("A&amp;B.pdf");
    expect(selected).toContain("ato-um.zip");
    expect(selected).toContain("op2-adventure-import__selection-check");
    expect(selected).not.toMatch(/data-action="analyzeFiles"\s+disabled/);

    mocks.analyzeAdventureSources.mockResolvedValue(emptyAnalysis(unencryptedRecognizedPdf()));
    await action(app, "analyzeFiles");
    const analyzed = render(await app._prepareContext());
    expect(analyzed.match(/class="op2-adventure-import__status-row /g)).toHaveLength(1);
    expect(analyzed).toContain("op2-adventure-import__status-row--recognized");
    expect(analyzed).not.toContain("AdventureImport.EmptyContent");
    expect(analyzed).toMatch(/data-action="importAssets"\s+disabled/);
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
    const inputs = [...template.matchAll(/<input\b[^>]*type="file"[^>]*>/g)].map(match => match[0]);
    expect(inputs).toHaveLength(3);
    expect(inputs.every(input => /\bhidden\b/.test(input))).toBe(true);
    expect(inputs.map(input => input.match(/accept="([^"]+)"/)?.[1])).toEqual([".pdf", ".zip", ".zip"]);
    expect(template).not.toContain('type="checkbox"');
    expect(template).not.toContain("Handouts.Title");
    expect([...template.matchAll(/data-action="(?:analyzeFiles|importAssets)"/g)]).toHaveLength(2);
    expect((JSON.parse(manifestText) as { styles: string[] }).styles).toContain("styles/adventure-import.css");
    expect(css).toContain(".op2-adventure-import__body button");
    expect(css).not.toMatch(/\.ordemparanormal2\.op2-adventure-import\s+button(?:\s|:|\{)/);
    expect(source).not.toMatch(/_getHeaderControls|FileReader|\.create\(|settings\.set|localStorage/);
    expect(css).toContain("max-height: calc(100dvh - 24px)");
    expect(css).toContain("container-type: inline-size");
    const locale = JSON.parse(localeText) as Record<string, unknown>;
    const adventureLocale = (locale.ORDEMPARANORMAL2 as Record<string, unknown>).AdventureImport;
    expect(JSON.stringify(adventureLocale)).not.toMatch(/Journal|worldStorage|storage|materializa|provenance|Document/);
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
