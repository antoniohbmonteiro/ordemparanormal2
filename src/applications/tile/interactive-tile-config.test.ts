import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
  const hooks = new Map<string, (...args: unknown[]) => void>();
  class FormDataExtended extends Map<string, unknown> {}
  class ForcedDeletion {}
  const replace = vi.fn((value: unknown) => ({ replacement: value }));
  class TileConfig {
    static DEFAULT_OPTIONS = { form: { closeOnSubmit: true } };
    static PARTS = {
      tabs: { template: "core-tabs.hbs" },
      position: { template: "core-position.hbs" },
      overhead: { template: "core-overhead.hbs" },
      appearance: { template: "core-appearance.hbs" },
      footer: { template: "core-footer.hbs" },
    };
    static TABS = {
      sheet: {
        initial: "position",
        labelPrefix: "TILE.TABS",
        tabs: [
          { id: "position", icon: "position" },
          { id: "overhead", icon: "overhead" },
          { id: "appearance", icon: "appearance" },
        ],
      },
    };
    readonly document: object;
    readonly tabGroups = { sheet: "interaction" };
    readonly form = new EventTarget() as HTMLFormElement;
    readonly element = { querySelector: () => null } as unknown as HTMLElement;
    readonly isEditable = true;
    readonly render = vi.fn().mockResolvedValue(undefined);

    constructor(options: { document: object }) {
      this.document = options.document;
    }

    protected async _prepareContext(): Promise<Record<string, unknown>> {
      return { rootId: "tile" };
    }

    protected async _preparePartContext(
      partId: string,
      context: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      return {
        ...context,
        tabClasses: partId === "interaction" ? "active" : "",
      };
    }

    protected async _onRender(): Promise<void> {}

    protected _attachPartListeners(): void {}
  }

  vi.stubGlobal("CONST", {
    WALL_DOOR_TYPES: { NONE: 0, DOOR: 1, SECRET: 2 },
  });
  vi.stubGlobal("game", {
    user: { isGM: true },
    i18n: {
      localize: (key: string) => key,
      format: (key: string) => key,
    },
  });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("Hooks", {
    on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
      hooks.set(name, callback);
      return hooks.size;
    }),
    off: vi.fn((name: string) => hooks.delete(name)),
  });
  vi.stubGlobal("foundry", {
    applications: {
      sheets: { TileConfig },
      ux: { FormDataExtended },
    },
    data: {
      operators: {
        ForcedDeletion,
        ForcedReplacement: { create: replace },
      },
    },
  });
  return { FormDataExtended, hooks, replace, TileConfig };
});

import {
  collectSelectedTileIds,
  collectSelectedWallIds,
  InteractiveTileConfig,
} from "./interactive-tile-config";

describe("Interactive TileConfig", () => {
  it("preserves all three core tabs, adds Interação, and leaves the footer last", () => {
    expect(InteractiveTileConfig.TABS.sheet.tabs.map(tab => tab.id)).toEqual([
      "position", "overhead", "appearance", "interaction",
    ]);
    expect(Object.keys(InteractiveTileConfig.PARTS)).toEqual([
      "tabs", "position", "overhead", "appearance", "interaction", "footer",
    ]);
    expect(InteractiveTileConfig.PARTS.footer).toBe(runtime.TileConfig.PARTS.footer);
  });

  it("restores the custom PART active class from the public tab group", async () => {
    const tile = {
      id: "controller",
      parent: { id: "scene", walls: new Map(), tiles: new Map() },
      getFlag: vi.fn(() => undefined),
    };
    const Constructor = InteractiveTileConfig as unknown as new (
      options: { document: object },
    ) => InteractiveTileConfig;
    const app = new Constructor({ document: tile });
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

    lifecycle.tabGroups.sheet = "position";
    await expect(
      lifecycle._preparePartContext("interaction", context, {}),
    ).resolves.toMatchObject({ tabClasses: "" });
    lifecycle.tabGroups.sheet = "interaction";
    await expect(
      lifecycle._preparePartContext("interaction", context, {}),
    ).resolves.toMatchObject({ tabClasses: "active" });
  });

  it("injects a full replacement only when the native form builds FormData", async () => {
    const scene = {
      id: "scene",
      walls: new Map(),
      tiles: new Map(),
    };
    const tile = {
      id: "controller",
      parent: scene,
      getFlag: vi.fn(() => ({
        enabled: true,
        wallIds: ["w1"],
        tileIds: ["t1"],
      })),
    };
    scene.tiles.set("controller", tile);
    const Constructor = InteractiveTileConfig as unknown as new (
      options: { document: object },
    ) => InteractiveTileConfig;
    const app = new Constructor({ document: tile });
    const lifecycle = app as unknown as {
      _prepareContext(options: object): Promise<object>;
      _onRender(context: object, options: object): Promise<void>;
      form: EventTarget;
    };

    await lifecycle._prepareContext({});
    expect(runtime.replace).not.toHaveBeenCalled();
    await lifecycle._onRender({}, {});
    expect(runtime.replace).not.toHaveBeenCalled();

    const formData = new runtime.FormDataExtended();
    lifecycle.form.dispatchEvent(Object.assign(new Event("formdata"), { formData }));
    expect(runtime.replace).toHaveBeenCalledExactlyOnceWith({
      enabled: true,
      wallIds: ["w1"],
      tileIds: ["t1"],
    });
    expect(formData.get("flags.ordemparanormal2.tileInteraction")).toEqual({
      replacement: { enabled: true, wallIds: ["w1"], tileIds: ["t1"] },
    });
  });

  it("filters selected Walls and excludes the controller from selected Tiles", () => {
    const placeable = (id: string | null, door?: number) => ({
      document: { id, door },
      control: vi.fn(() => true),
    });
    expect(collectSelectedWallIds([
      placeable("door", 1),
      placeable("secret", 2),
      placeable("ordinary", 0),
      placeable(null, 1),
    ])).toEqual({ ids: ["door", "secret"], ignored: 1 });
    expect(collectSelectedTileIds([
      placeable("controller"),
      placeable("target"),
      placeable("target"),
      placeable(null),
    ], "controller")).toEqual(["target"]);
    expect(collectSelectedTileIds([], "controller")).toEqual([]);
  });

  it("wires the rendered selection button to the public Canvas layer", async () => {
    const scene = { id: "scene", walls: new Map(), tiles: new Map() };
    const tile = {
      id: "controller",
      parent: scene,
      getFlag: vi.fn(() => ({ enabled: false, wallIds: [], tileIds: [] })),
    };
    scene.tiles.set("controller", tile);
    const Constructor = InteractiveTileConfig as unknown as new (
      options: { document: object },
    ) => InteractiveTileConfig;
    const app = new Constructor({ document: tile });
    const button = Object.assign(new EventTarget(), {
      dataset: { op2Action: "select-walls" },
    }) as unknown as HTMLElement;
    const use = Object.assign(new EventTarget(), {
      dataset: { op2Action: "use-walls" },
      hidden: true,
    }) as unknown as HTMLButtonElement;
    const interactionPart = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn((selector: string) =>
        selector.includes("^=") ? [use] : [button, use]),
    };
    const layer = {
      controlled: [],
      activate: vi.fn(),
      releaseAll: vi.fn(),
      get: vi.fn(),
    };
    const previousCanvas = (globalThis as { canvas?: unknown }).canvas;
    Object.assign(globalThis, {
      canvas: {
        scene: { id: "scene" },
        getLayerByEmbeddedName: vi.fn(() => layer),
      },
    });
    const lifecycle = app as unknown as {
      _prepareContext(options: object): Promise<object>;
      _attachPartListeners(
        partId: string,
        htmlElement: HTMLElement,
        options: object,
      ): void;
    };

    try {
      await lifecycle._prepareContext({});
      lifecycle._attachPartListeners(
        "interaction",
        interactionPart as unknown as HTMLElement,
        {},
      );
      button.dispatchEvent(new Event("click"));
      await vi.waitFor(() => {
        expect(layer.activate).toHaveBeenCalledExactlyOnceWith({ tool: "select" });
      });
      expect(layer.releaseAll).toHaveBeenCalledOnce();
      expect(use.hidden).toBe(false);
      expect(app.render).not.toHaveBeenCalled();
    } finally {
      Object.assign(globalThis, { canvas: previousCanvas });
    }
  });

  it("persists an enabled control before selecting Walls", async () => {
    const scene = { id: "scene", walls: new Map(), tiles: new Map() };
    const tile = {
      id: "controller",
      parent: scene,
      getFlag: vi.fn(() => undefined),
    };
    scene.tiles.set("controller", tile);
    const Constructor = InteractiveTileConfig as unknown as new (
      options: { document: object },
    ) => InteractiveTileConfig;
    const app = new Constructor({ document: tile });
    const checkbox = Object.assign(
      new EventTarget(),
      { checked: true },
    ) as unknown as HTMLInputElement;
    const interactionPart = {
      querySelector: vi.fn(() => checkbox),
      querySelectorAll: vi.fn(() => []),
    };
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

    const context = await lifecycle._prepareContext({});
    expect(context.tileInteraction).not.toHaveProperty("disableEnabled");
    lifecycle._attachPartListeners(
      "interaction",
      interactionPart as unknown as HTMLElement,
      {},
    );
    checkbox.dispatchEvent(new Event("change"));
    await lifecycle._onRender({}, {});

    const formData = new runtime.FormDataExtended();
    lifecycle.form.dispatchEvent(Object.assign(new Event("formdata"), { formData }));
    expect(formData.get("flags.ordemparanormal2.tileInteraction")).toEqual({
      replacement: { enabled: true, wallIds: [], tileIds: [] },
    });
  });

  it("keeps the control enabled after removing its last Wall target", async () => {
    const scene = { id: "scene", walls: new Map(), tiles: new Map() };
    const tile = {
      id: "controller",
      parent: scene,
      getFlag: vi.fn(() => ({ enabled: true, wallIds: ["w1"], tileIds: [] })),
    };
    scene.tiles.set("controller", tile);
    const Constructor = InteractiveTileConfig as unknown as new (
      options: { document: object },
    ) => InteractiveTileConfig;
    const app = new Constructor({ document: tile });
    const remove = Object.assign(new EventTarget(), {
      dataset: { op2Action: "remove-wall", targetId: "w1" },
    }) as unknown as HTMLElement;
    const part = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [remove]),
    } as unknown as HTMLElement;
    const lifecycle = app as unknown as {
      _prepareContext(options: object): Promise<Record<string, unknown>>;
      _onRender(context: object, options: object): Promise<void>;
      _attachPartListeners(partId: string, htmlElement: HTMLElement, options: object): void;
      form: EventTarget;
    };
    await lifecycle._prepareContext({});
    lifecycle._attachPartListeners("interaction", part, {});
    remove.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(app.render).toHaveBeenCalledOnce());
    await expect(lifecycle._prepareContext({})).resolves.toMatchObject({
      tileInteraction: { enabled: true, wallTargets: [] },
    });
    await lifecycle._onRender({}, {});
    const formData = new runtime.FormDataExtended();
    lifecycle.form.dispatchEvent(Object.assign(new Event("formdata"), { formData }));
    expect(formData.get("flags.ordemparanormal2.tileInteraction")).toEqual({
      replacement: { enabled: true, wallIds: [], tileIds: [] },
    });
  });

  it("captures selected embedded Documents through Foundry control hooks", async () => {
    const scene = { id: "scene", walls: new Map(), tiles: new Map() };
    const tile = {
      id: "controller",
      parent: scene,
      getFlag: vi.fn(() => undefined),
    };
    const wall = { id: "wall", parent: scene, documentName: "Wall", door: 1 };
    scene.tiles.set("controller", tile);
    scene.walls.set("wall", wall);
    const Constructor = InteractiveTileConfig as unknown as new (
      options: { document: object },
    ) => InteractiveTileConfig;
    const app = new Constructor({ document: tile });
    const select = Object.assign(new EventTarget(), {
      dataset: { op2Action: "select-walls" },
    }) as unknown as HTMLElement;
    const use = Object.assign(new EventTarget(), {
      dataset: { op2Action: "use-walls" },
    }) as unknown as HTMLElement;
    const part = (buttons: HTMLElement[]) => ({
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn((selector: string) =>
        selector.includes("^=")
          ? buttons.filter(button => button.dataset.op2Action?.startsWith("use-"))
          : buttons),
    }) as unknown as HTMLElement;
    const layer = {
      controlled: [],
      activate: vi.fn(),
      releaseAll: vi.fn(),
      get: vi.fn(),
    };
    const previousCanvas = (globalThis as { canvas?: unknown }).canvas;
    Object.assign(globalThis, {
      canvas: {
        scene: { id: "scene" },
        getLayerByEmbeddedName: vi.fn(() => layer),
      },
    });
    const lifecycle = app as unknown as {
      _prepareContext(options: object): Promise<Record<string, unknown>>;
      _attachPartListeners(
        partId: string,
        htmlElement: HTMLElement,
        options: object,
      ): void;
    };

    try {
      lifecycle._attachPartListeners("interaction", part([select]), {});
      select.dispatchEvent(new Event("click"));
      await vi.waitFor(() => expect(runtime.hooks.has("controlWall")).toBe(true));
      runtime.hooks.get("controlWall")?.({ document: wall }, true);
      lifecycle._attachPartListeners("interaction", part([use]), {});
      use.dispatchEvent(new Event("click"));
      await vi.waitFor(async () => {
        const context = await lifecycle._prepareContext({});
        expect(context.tileInteraction).toMatchObject({
          wallTargets: [expect.objectContaining({ id: "wall" })],
        });
      });
      expect(Hooks.off).toHaveBeenCalled();
    } finally {
      Object.assign(globalThis, { canvas: previousCanvas });
    }
  });

  it("ships its own template/style/localization and registers for TileDocument", async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const [template, style, manifestSource, localizationSource, sheetsSource] =
      await Promise.all([
        readFile(`${root}templates/tile/tile-interaction-tab.hbs`, "utf8"),
        readFile(`${root}styles/tile-interaction.css`, "utf8"),
        readFile(`${root}system.json`, "utf8"),
        readFile(`${root}lang/pt-BR.json`, "utf8"),
        readFile(`${root}src/bootstrap/register-sheets.ts`, "utf8"),
      ]);
    const manifest = JSON.parse(manifestSource) as { styles: string[] };
    const localization = JSON.parse(localizationSource) as {
      ORDEMPARANORMAL2: { TileInteraction: { Tab: string } };
    };
    expect(template).toContain('data-tab="interaction"');
    expect(template).toContain('data-op2-action="use-walls"');
    expect(template).not.toContain("tileInteraction.disableEnabled");
    expect(style).toContain(".op2-tile-interaction.active");
    expect(manifest.styles).toContain("styles/tile-interaction.css");
    expect(localization.ORDEMPARANORMAL2.TileInteraction.Tab).toBe("Interação");
    expect(sheetsSource).toContain("foundry.documents.TileDocument");
    expect(sheetsSource).toContain("InteractiveTileConfig");
  });
});
