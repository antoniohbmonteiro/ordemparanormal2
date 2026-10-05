import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const picker = vi.hoisted(() => ({
  open: vi.fn(),
  resolve: vi.fn().mockResolvedValue(null),
}));

vi.mock("../points-of-interest/poi-picker", () => ({ openPoiPicker: picker.open }));
vi.mock("../../adapters/foundry/points-of-interest/poi-catalog", () => ({
  resolvePoiAssociation: picker.resolve,
}));

const runtime = vi.hoisted(() => {
  class FormDataExtended extends Map<string, unknown> {}
  class ForcedDeletion {}
  const replace = vi.fn((value: unknown) => ({ replacement: value }));
  class RegionConfig {
    static DEFAULT_OPTIONS = { form: { closeOnSubmit: true } };
    static PARTS = {
      tabs: { template: "core-tabs.hbs" },
      appearance: { template: "core-appearance.hbs" },
      shapes: { template: "core-shapes.hbs" },
      placement: { template: "core-placement.hbs" },
      behaviors: { template: "core-behaviors.hbs" },
      footer: { template: "core-footer.hbs" },
    };
    static TABS = {
      sheet: {
        initial: "appearance",
        labelPrefix: "REGION.TABS",
        tabs: [
          { id: "appearance", icon: "appearance" },
          { id: "shapes", icon: "shapes" },
          { id: "placement", icon: "placement" },
          { id: "behaviors", icon: "behaviors" },
        ],
      },
    };
    readonly document: object;
    readonly tabGroups = { sheet: "point-of-interest" };
    readonly form = new EventTarget() as HTMLFormElement;
    readonly isEditable = true;
    readonly render = vi.fn().mockResolvedValue(undefined);

    constructor(options: { document: object }) {
      this.document = options.document;
    }

    protected async _prepareContext(): Promise<Record<string, unknown>> {
      return { rootId: "region" };
    }

    protected async _preparePartContext(
      partId: string,
      context: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      return { ...context, tabClasses: partId === "point-of-interest" ? "active" : "" };
    }

    protected async _onRender(): Promise<void> {}
    protected _onClose(): void {}
    protected _attachPartListeners(): void {}
  }

  vi.stubGlobal("game", {
    user: { isGM: true },
    i18n: { localize: (key: string) => key },
  });
  vi.stubGlobal("foundry", {
    applications: {
      sheets: { RegionConfig },
      ux: { FormDataExtended },
    },
    data: {
      operators: {
        ForcedDeletion,
        ForcedReplacement: { create: replace },
      },
    },
  });
  return { FormDataExtended, RegionConfig, replace };
});

import { InteractiveRegionConfig } from "./interactive-region-config";

beforeEach(() => {
  picker.open.mockReset();
  picker.resolve.mockReset().mockResolvedValue(null);
  runtime.replace.mockClear();
});

function createApp(raw?: unknown) {
  const scene = { id: "scene", regions: new Map<string, object>() };
  const region = {
    id: "region",
    parent: scene,
    getFlag: vi.fn(() => raw),
  };
  scene.regions.set("region", region);
  const Constructor = InteractiveRegionConfig as unknown as new (
    options: { document: object },
  ) => InteractiveRegionConfig;
  return new Constructor({ document: region });
}

function actionElement(action: string): HTMLElement {
  return Object.assign(new EventTarget(), {
    dataset: { op2Action: action },
  }) as unknown as HTMLElement;
}

function part(...actions: HTMLElement[]): HTMLElement {
  return {
    querySelectorAll: vi.fn(() => actions),
  } as unknown as HTMLElement;
}

describe("Interactive RegionConfig", () => {
  it("preserves four core tabs, adds the POI tab, and leaves the footer last", () => {
    expect(InteractiveRegionConfig.TABS.sheet.tabs.map(tab => tab.id)).toEqual([
      "appearance", "shapes", "placement", "behaviors", "point-of-interest",
    ]);
    expect(Object.keys(InteractiveRegionConfig.PARTS)).toEqual([
      "tabs", "appearance", "shapes", "placement", "behaviors",
      "point-of-interest", "footer",
    ]);
    expect(InteractiveRegionConfig.PARTS.footer)
      .toBe(runtime.RegionConfig.PARTS.footer);
  });

  it("restores the custom PART active class from the public tab group", async () => {
    const app = createApp();
    const lifecycle = app as unknown as {
      _prepareContext(options: object): Promise<Record<string, unknown>>;
      _preparePartContext(
        partId: string,
        context: Record<string, unknown>,
        options: object,
      ): Promise<Record<string, unknown>>;
      tabGroups: { sheet: string };
    };
    const context = await lifecycle._prepareContext({});
    lifecycle.tabGroups.sheet = "appearance";
    await expect(lifecycle._preparePartContext("point-of-interest", context, {}))
      .resolves.toMatchObject({ tabClasses: "" });
    lifecycle.tabGroups.sheet = "point-of-interest";
    await expect(lifecycle._preparePartContext("point-of-interest", context, {}))
      .resolves.toMatchObject({ tabClasses: "active" });
  });

  it("keeps picker changes local until the native Region submit", async () => {
    picker.open.mockReturnValue({
      result: Promise.resolve({ itemUuid: "Item.poi", name: "Biblioteca", origin: "Mundo" }),
      close: vi.fn(),
    });
    const app = createApp();
    const choose = actionElement("choose-poi");
    const lifecycle = app as unknown as {
      _prepareContext(options: object): Promise<Record<string, unknown>>;
      _onRender(context: object, options: object): Promise<void>;
      _attachPartListeners(
        partId: string,
        htmlElement: HTMLElement,
        options: object,
      ): void;
      form: EventTarget;
    };

    lifecycle._attachPartListeners("point-of-interest", part(choose), {});
    choose.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(app.render).toHaveBeenCalledTimes(2));
    await lifecycle._onRender({}, {});

    const formData = new runtime.FormDataExtended();
    lifecycle.form.dispatchEvent(Object.assign(new Event("formdata"), { formData }));
    expect(runtime.replace).toHaveBeenCalledWith({
      itemUuid: "Item.poi",
    });
    expect(formData.get("flags.ordemparanormal2.pointOfInterest")).toEqual({
      replacement: { itemUuid: "Item.poi" },
    });
  });

  it("leaves unchanged drafts out of FormData and deletes only on request", async () => {
    const app = createApp({ itemUuid: "Item.old", name: "Antigo" });
    const remove = actionElement("remove-poi");
    const lifecycle = app as unknown as {
      _onRender(context: object, options: object): Promise<void>;
      _attachPartListeners(
        partId: string,
        htmlElement: HTMLElement,
        options: object,
      ): void;
      form: EventTarget;
    };
    await lifecycle._onRender({}, {});
    const unchanged = new runtime.FormDataExtended();
    lifecycle.form.dispatchEvent(Object.assign(new Event("formdata"), {
      formData: unchanged,
    }));
    expect(unchanged.size).toBe(0);

    lifecycle._attachPartListeners("point-of-interest", part(remove), {});
    remove.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(app.render).toHaveBeenCalledOnce());
    const removed = new runtime.FormDataExtended();
    lifecycle.form.dispatchEvent(Object.assign(new Event("formdata"), {
      formData: removed,
    }));
    expect(removed.get("flags.ordemparanormal2.pointOfInterest"))
      .toBeInstanceOf(foundry.data.operators.ForcedDeletion);
  });

  it("closes its picker and ignores a late result when the Region sheet closes", async () => {
    let finish!: (selection: unknown) => void;
    const close = vi.fn().mockResolvedValue(undefined);
    picker.open.mockReturnValue({
      result: new Promise(resolve => { finish = resolve; }),
      close,
    });
    const app = createApp();
    const choose = actionElement("choose-poi");
    const lifecycle = app as unknown as {
      _attachPartListeners(
        partId: string,
        htmlElement: HTMLElement,
        options: object,
      ): void;
      _onClose(options: object): void;
    };
    lifecycle._attachPartListeners("point-of-interest", part(choose), {});
    choose.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(app.render).toHaveBeenCalledOnce());
    lifecycle._onClose({});
    finish({ itemUuid: "Item.late", name: "Tarde", origin: "Mundo" });
    await Promise.resolve();
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
    expect(app.render).toHaveBeenCalledOnce();
  });

  it("ships a native tab template and registers the Region sheet", async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const [template, style, localizationSource, sheetsSource, mainSource] =
      await Promise.all([
        readFile(`${root}templates/region/poi-tab.hbs`, "utf8"),
        readFile(`${root}styles/poi-region-config.css`, "utf8"),
        readFile(`${root}lang/pt-BR.json`, "utf8"),
        readFile(`${root}src/bootstrap/register-sheets.ts`, "utf8"),
        readFile(`${root}src/main.ts`, "utf8"),
      ]);
    const localization = JSON.parse(localizationSource) as {
      ORDEMPARANORMAL2: { PointOfInterest: { RegionConfig: { Title: string } } };
    };
    expect(template).toContain('data-tab="point-of-interest"');
    expect(style).toContain(".op2-poi-region-association.active");
    expect(localization.ORDEMPARANORMAL2.PointOfInterest.RegionConfig.Title)
      .toBe("Ponto de Interesse");
    expect(sheetsSource).toContain("foundry.documents.RegionDocument");
    expect(sheetsSource).toContain("InteractiveRegionConfig");
    expect(mainSource).not.toContain("registerPoiRegionConfig");
  });
});
