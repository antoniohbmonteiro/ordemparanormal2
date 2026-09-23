import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { picker, mutate, requestScene, showMenu } = vi.hoisted(() => ({
  picker: vi.fn(), mutate: vi.fn(), requestScene: vi.fn(), showMenu: vi.fn(),
}));
vi.mock("./poi-picker", () => ({ openPoiPicker: picker }));
vi.mock("../../adapters/foundry/points-of-interest/poi-runtime-queries", () => ({
  mutatePoi: mutate, requestPoiScene: requestScene, subscribePoiInvalidation: () => () => undefined,
}));
vi.mock("../../adapters/foundry/points-of-interest/poi-runtime-state", () => ({
  associatedRegionIds: () => [], readPoiVisibility: () => ({ mode: "hidden", users: [] }),
  readScenePoiUuids: () => ["Item.existing"],
  isWorldPoiUuid: (uuid: unknown) => typeof uuid === "string" && /^Item\.[^.]+$/u.test(uuid),
  worldPoi: (uuid: string) => uuid === "Item.new" ? { uuid } : null,
  isGmControlledPoi: () => true,
}));
vi.mock("./poi-user-reveal-dialog", () => ({ openPoiUserRevealDialog: vi.fn() }));
vi.mock("./investigation-application", () => ({ openInvestigationApplication: vi.fn() }));
vi.mock("./poi-scene-panel-menu", async importOriginal => ({
  ...(await importOriginal<typeof import("./poi-scene-panel-menu")>()), showPoiSceneMenu: showMenu,
}));

class ApplicationStub {
  constructor(_options?: unknown) {}
  render = vi.fn(async () => undefined);
  bringToFront(): void {}
  _attachPartListeners(): void {}
  _onFirstRender(): Promise<void> { return Promise.resolve(); }
  _onClose(): void {}
}

beforeEach(() => {
  picker.mockReset(); mutate.mockReset().mockResolvedValue({ ok: true });
  requestScene.mockReset().mockResolvedValue({ entries: [] });
  showMenu.mockReset().mockReturnValue(() => undefined);
  vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: ApplicationStub, HandlebarsApplicationMixin: (base: unknown) => base },
    ux: { TextEditor: { implementation: { getDragEventData: (event: Event & { payload?: Record<string, unknown> }) => event.payload ?? {} } } } } });
  vi.stubGlobal("game", { user: { isGM: true }, scenes: { get: () => ({ name: "Porão" }) },
    i18n: { localize: (key: string) => key } });
  vi.stubGlobal("ui", { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("POI Scene panel add entry points", () => {
  it("the existing Add action opens the picker and adds its selection", async () => {
    const { PoiScenePanel } = await import("./poi-scene-panel");
    picker.mockReturnValue({ result: Promise.resolve({ itemUuid: "Item.new" }) });
    const panel = new PoiScenePanel("scene");
    await PoiScenePanel.DEFAULT_OPTIONS.actions.add.call(panel);
    expect(picker).toHaveBeenCalledExactlyOnceWith({ purpose: "scene", excludeItemUuids: ["Item.existing"] });
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ action: "add", sceneId: "scene", itemUuid: "Item.new" });
  });

  it("a drop calls the same membership mutation without opening the picker", async () => {
    const { PoiScenePanel } = await import("./poi-scene-panel");
    const panel = new PoiScenePanel("scene");
    const root = new EventTarget() as HTMLElement;
    Object.defineProperties(root, {
      classList: { value: { remove: () => undefined, toggle: () => undefined } },
      contains: { value: () => false },
    });
    const document = new EventTarget();
    vi.stubGlobal("document", document);
    (panel as unknown as { _attachPartListeners(part: string, root: HTMLElement, options: object): void })
      ._attachPartListeners("main", root, {});
    const drop = new Event("drop", { cancelable: true });
    Object.defineProperty(drop, "payload", { value: { type: "Item", uuid: "Item.new" } });
    root.dispatchEvent(drop);
    await Promise.resolve();
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ action: "add", sceneId: "scene", itemUuid: "Item.new" });
    expect(picker).not.toHaveBeenCalled();
    (panel as unknown as { _onClose(options: object): void })._onClose({});
  });

  it("gives the player the same two-action menu from kebab and right click without revealing hidden locations", async () => {
    const { PoiScenePanel } = await import("./poi-scene-panel");
    (game.user as { isGM: boolean }).isGM = false;
    requestScene.mockResolvedValue({ entries: [{ itemUuid: "Item.new", name: "Armário", img: "", linkedRegionIds: [] }] });
    const spatial = { id: "region", parent: { id: "scene" }, viewed: false,
      polygonTree: { area: 100, bounds: { x: 0, y: 0, width: 10, height: 10, contains: () => true } },
      getFlag: () => ({ itemUuid: "Item.new" }) };
    vi.stubGlobal("canvas", { ready: true, scene: { id: "scene", regions: [spatial] } });
    const panel = new PoiScenePanel("scene");
    await panel.refresh();
    const context = await (panel as unknown as { _prepareContext(): Promise<{ entries: Array<{ locationCount: number }> }> })._prepareContext();
    expect(context.entries[0]?.locationCount).toBe(0);
    const row = { dataset: { itemUuid: "Item.new" }, closest: (selector: string) => selector === "[data-item-uuid]" ? row : null };
    const trigger = { closest: (selector: string) => selector === "[data-poi-menu-trigger]" ? trigger : row,
      getBoundingClientRect: () => ({ right: 10, bottom: 20 }) };
    const root = new EventTarget() as HTMLElement;
    Object.defineProperty(root, "contains", { value: (target: unknown) => target === row });
    (panel as unknown as { _attachPartListeners(part: string, root: HTMLElement, options: object): void })
      ._attachPartListeners("main", root, {});
    const click = new Event("click") as MouseEvent;
    Object.defineProperties(click, { target: { value: trigger }, detail: { value: 1 } });
    root.dispatchEvent(click);
    const contextMenu = new Event("contextmenu", { cancelable: true }) as MouseEvent;
    Object.defineProperties(contextMenu, { target: { value: row }, clientX: { value: 30 }, clientY: { value: 40 } });
    root.dispatchEvent(contextMenu);
    expect(showMenu).toHaveBeenCalledTimes(2);
    for (const call of showMenu.mock.calls) {
      const entries = call[1] as Array<{ action: string; disabled?: boolean }>;
      expect(entries.map(entry => entry.action)).toEqual(["open", "locate"]);
      expect(entries[1]?.disabled).toBe(true);
    }
    const select = showMenu.mock.calls[0]?.[2] as (action: string) => void;
    select("everyone");
    expect(mutate).not.toHaveBeenCalled();
    spatial.viewed = true;
    root.dispatchEvent(click);
    expect((showMenu.mock.calls.at(-1)?.[1] as Array<{ action: string; disabled?: boolean }>)[1]?.disabled).toBe(false);
    (panel as unknown as { _onClose(options: object): void })._onClose({});
  });
});
