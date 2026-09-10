import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

interface PaletteInstance {
  _canRender(options: object): boolean | void;
  _onFirstRender(context: object, options: object): Promise<void>;
}

let handle: object;
let element: { querySelector: ReturnType<typeof vi.fn> };
let draggableArguments: unknown[] | null;
let setPosition: ReturnType<typeof vi.fn>;
let GmToolsPaletteClass: {
  new (): PaletteInstance;
  DEFAULT_OPTIONS: {
    actions: Record<string, () => void>;
    position: { top: number; left: number; width: "auto"; height: "auto" };
    window: {
      frame: boolean;
      minimizable: boolean;
      positioned: boolean;
      resizable: boolean;
      title?: string;
    };
  };
};

beforeAll(async () => {
  handle = {};
  element = { querySelector: vi.fn(() => handle) };
  draggableArguments = null;
  class MockDraggable {
    constructor(...args: unknown[]) {
      draggableArguments = args;
    }
  }
  setPosition = vi.fn();
  class MockApplicationV2 {
    readonly element = element;
    readonly setPosition = setPosition;

    protected _canRender(): boolean {
      return true;
    }

    protected async _onFirstRender(): Promise<void> {}
  }
  vi.stubGlobal("foundry", {
    applications: {
      api: {
        ApplicationV2: MockApplicationV2,
        HandlebarsApplicationMixin: <T>(Base: T): T => Base,
      },
      ux: { Draggable: { implementation: MockDraggable } },
    },
  });
  vi.stubGlobal("game", { user: { isGM: true } });
  const module = await import("./gm-tools-palette");
  GmToolsPaletteClass = module.GmToolsPalette as unknown as typeof GmToolsPaletteClass;
});

afterAll(() => vi.unstubAllGlobals());

describe("GmToolsPalette", () => {
  it("uses a compact, positioned frameless application", () => {
    expect(GmToolsPaletteClass.DEFAULT_OPTIONS.position).toEqual({
      top: 80,
      left: 220,
      width: "auto",
      height: "auto",
    });
    expect(GmToolsPaletteClass.DEFAULT_OPTIONS.window).toEqual({
      frame: false,
      positioned: true,
      resizable: false,
      minimizable: false,
    });
    expect(GmToolsPaletteClass.DEFAULT_OPTIONS.window).not.toHaveProperty("title");
  });

  it("allows only a GM to render", () => {
    const palette = new GmToolsPaletteClass();
    expect(palette._canRender({})).toBe(true);

    vi.stubGlobal("game", { user: { isGM: false } });
    expect(palette._canRender({})).toBe(false);
  });

  it("positions itself and delegates drag activation to Foundry for only the custom grip", async () => {
    const palette = new GmToolsPaletteClass();

    await palette._onFirstRender({}, {});

    expect(setPosition).toHaveBeenCalledExactlyOnceWith();
    expect(element.querySelector).toHaveBeenCalledWith("[data-drag-handle]");
    expect(draggableArguments).toEqual([
      palette,
      element,
      handle,
      false,
    ]);
  });

  it("defines exactly two inert actions", () => {
    expect(Object.keys(GmToolsPaletteClass.DEFAULT_OPTIONS.actions)).toEqual([
      "requestCheck",
      "opposedCheck",
    ]);
    expect(GmToolsPaletteClass.DEFAULT_OPTIONS.actions.requestCheck()).toBeUndefined();
    expect(GmToolsPaletteClass.DEFAULT_OPTIONS.actions.opposedCheck()).toBeUndefined();
  });
});

describe("GM Tools Palette template and assets", () => {
  it("keeps the frameless palette out of the document layout", async () => {
    const css = await readFile(
      fileURLToPath(new URL("../../../styles/gm-tools-palette.css", import.meta.url)),
      "utf8",
    );
    expect(css).toMatch(/\.ordemparanormal2\.op2-gm-tools-palette\s*\{[^}]*position:\s*fixed;/s);
  });

  it("renders one grip and exactly two accessible actions", async () => {
    const template = await readFile(
      fileURLToPath(new URL("../../../templates/applications/gm-tools-palette.hbs", import.meta.url)),
      "utf8",
    );
    const actions = [...template.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]);

    expect(actions).toEqual(["requestCheck", "opposedCheck"]);
    expect(template.match(/data-drag-handle/g)).toHaveLength(1);
    expect(template).toContain("assets/icons/gm-tools/rolling-dices.svg");
    expect(template).toContain("assets/icons/gm-tools/sword-clash.svg");
    expect(template.match(/aria-hidden="true"/g)).toHaveLength(3);
    expect(template.match(/alt=""/g)).toHaveLength(2);
    expect(template.match(/aria-label=/g)).toHaveLength(3);
    expect(template.match(/title=/g)).toHaveLength(2);
    expect(template).not.toMatch(/fa-(?:solid|regular|brands)|d20|DialogV2|ChatMessage|socket|Actor/i);
  });

  it.each([
    ["rolling-dices.svg", "795f6fc8920feb97ca099fc5aef9e578676a10557baf4bbc64507ced4259feb8"],
    ["sword-clash.svg", "9c9ecd06d0d21be6a1cadc91893b22a6ba1e4b7ff9bd14514dfef3013559a1ba"],
  ])("uses the supplied %s asset", async (filename, expectedHash) => {
    const asset = await readFile(
      fileURLToPath(new URL(`../../../assets/icons/gm-tools/${filename}`, import.meta.url)),
    );
    expect(asset.toString()).toContain('viewBox="0 0 512 512"');
    expect(createHash("sha256").update(asset).digest("hex")).toBe(expectedHash);
  });
});
