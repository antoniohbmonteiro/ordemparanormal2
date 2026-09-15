import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const instances: MockApplicationV2[] = [];
let onRender: ((application: MockApplicationV2) => Promise<void>) | null = null;

class MockApplicationV2 {
  readonly render = vi.fn(async () => {
    await onRender?.(this);
    return this;
  });
  readonly bringToFront = vi.fn();
  readonly listeners = new Map<string, ((event: Event) => void)[]>();

  constructor() {
    instances.push(this);
  }

  protected _canRender(): boolean {
    return true;
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emitClose(): void {
    for (const listener of this.listeners.get("close") ?? []) listener(new Event("close"));
    this.listeners.delete("close");
  }
}

let applicationModule: typeof import("./adventure-import-application");

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    applications: {
      api: {
        ApplicationV2: MockApplicationV2,
        HandlebarsApplicationMixin: <T>(Base: T): T => Base,
      },
    },
  });
  vi.stubGlobal("game", { user: { isGM: true } });
  applicationModule = await import("./adventure-import-application");
});

beforeEach(() => {
  vi.stubGlobal("game", { user: { isGM: true } });
  for (const instance of instances) instance.emitClose();
  instances.length = 0;
  onRender = null;
});

afterAll(() => vi.unstubAllGlobals());

describe("Adventure Import Application", () => {
  it("uses one native, resizable window and refuses non-GM rendering", () => {
    const Application = applicationModule.AdventureImportApplication as unknown as {
      new (): { _canRender(options: object): boolean };
      DEFAULT_OPTIONS: { position: object; window: object };
      PARTS: object;
    };
    expect(Application.DEFAULT_OPTIONS.position).toEqual({ width: 800, height: "auto" });
    expect(Application.DEFAULT_OPTIONS.window).toMatchObject({
      title: "ORDEMPARANORMAL2.AdventureImport.Title",
      resizable: true,
    });
    expect(Application.PARTS).toHaveProperty("main");
    const app = new Application();
    expect(app._canRender({})).toBe(true);
    vi.stubGlobal("game", { user: { isGM: false } });
    expect(app._canRender({})).toBe(false);
  });

  it("opens once and brings the existing window to the front", async () => {
    await applicationModule.openAdventureImporter();
    await applicationModule.openAdventureImporter();
    expect(instances).toHaveLength(1);
    expect(instances[0].render).toHaveBeenCalledExactlyOnceWith({ force: true });
    expect(instances[0].bringToFront).toHaveBeenCalledOnce();
  });

  it("registers the window before rendering and avoids concurrent duplicates", async () => {
    let releaseRender: (() => void) | null = null;
    onRender = () => new Promise<void>(resolve => { releaseRender = resolve; });
    const first = applicationModule.openAdventureImporter();
    const second = applicationModule.openAdventureImporter();
    expect(instances).toHaveLength(1);
    if (!releaseRender) throw new Error("Render did not start.");
    (releaseRender as () => void)();
    await Promise.all([first, second]);
    expect(instances[0].bringToFront).toHaveBeenCalledOnce();
  });

  it("can reopen after close or failed rendering", async () => {
    await applicationModule.openAdventureImporter();
    instances[0].emitClose();
    onRender = async () => { throw new Error("render failed"); };
    await expect(applicationModule.openAdventureImporter()).rejects.toThrow("render failed");
    onRender = null;
    await applicationModule.openAdventureImporter();
    expect(instances).toHaveLength(3);
  });

  it("does not create a window for a non-GM", async () => {
    vi.stubGlobal("game", { user: { isGM: false } });
    await applicationModule.openAdventureImporter();
    expect(instances).toHaveLength(0);
  });
});

describe("Adventure Import shell", () => {
  it("shows only empty states and five disabled controls", async () => {
    const template = await readFile(
      fileURLToPath(new URL("../../../templates/applications/adventure-import.hbs", import.meta.url)),
      "utf8",
    );
    const buttons = [...template.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
    expect(buttons).toHaveLength(5);
    expect(buttons.every(button => /\bdisabled\b/.test(button))).toBe(true);
    expect(template.match(/AdventureImport\.EmptyFile/g)).toHaveLength(3);
    expect(template).toContain("AdventureImport.EmptyContent");
    expect(template).not.toMatch(/<input\b|data-action=|\b(?:Actor|Item|Scene|JournalEntry)\b/);
  });

  it("registers scoped styling and localizes all shell text", async () => {
    const [css, manifestText, localeText, template] = await Promise.all([
      readFile(fileURLToPath(new URL("../../../styles/adventure-import.css", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../system.json", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../templates/applications/adventure-import.hbs", import.meta.url)), "utf8"),
    ]);
    const manifest = JSON.parse(manifestText) as { styles: string[] };
    const locale = JSON.parse(localeText) as Record<string, unknown>;
    expect(manifest.styles).toContain("styles/adventure-import.css");
    expect(css).toContain(".ordemparanormal2.op2-adventure-import");
    expect(css).toContain("max-height: calc(100dvh - 24px)");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("@container (max-width: 570px)");
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
