import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { picker, mutate, requestScene, showMenu, resolveAgent, requestAction } = vi.hoisted(() => ({
  picker: vi.fn(), mutate: vi.fn(), requestScene: vi.fn(), showMenu: vi.fn(),
  resolveAgent: vi.fn(), requestAction: vi.fn(),
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
vi.mock("../../adapters/foundry/points-of-interest/resolve-investigation-agent", () => ({ resolveSceneInvestigationAgent: resolveAgent }));
vi.mock("../../adapters/foundry/points-of-interest/investigation-requests", () => ({ requestInvestigationAction: requestAction }));
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
  resolveAgent.mockReset().mockReturnValue(null);
  requestAction.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: ApplicationStub, HandlebarsApplicationMixin: (base: unknown) => base },
    ux: { TextEditor: { implementation: { getDragEventData: (event: Event & { payload?: Record<string, unknown> }) => event.payload ?? {} } } } } });
  vi.stubGlobal("game", { user: { isGM: true }, scenes: { get: () => ({ name: "Porão" }) },
    i18n: { localize: (key: string) => key } });
  vi.stubGlobal("ui", { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("POI Scene panel search", () => {
  function searchRoot(value = "") {
    const search = Object.assign(new EventTarget(), { value });
    const rows = ["Item.idol", "Item.wardrobe"].map(itemUuid => ({ dataset: { itemUuid }, hidden: false }));
    const noMatches = { hidden: true };
    const empty = { hidden: true };
    const root = new EventTarget() as HTMLElement;
    Object.defineProperties(root, {
      contains: { value: () => false },
      classList: { value: { remove: () => undefined, toggle: () => undefined } },
      querySelector: { value: (selector: string) => selector === 'input[name="search"]' ? search
        : selector === "[data-poi-search-empty]" ? noMatches : empty },
      querySelectorAll: { value: () => rows },
    });
    const type = (value: string) => { search.value = value; search.dispatchEvent(new Event("input")); };
    return { root, rows, noMatches, empty, type };
  }

  it.each([true, false])("filters locally and preserves expansion through clearing and rerender (GM=%s)", async isGM => {
    const { PoiScenePanel } = await import("./poi-scene-panel");
    (game.user as { isGM: boolean }).isGM = isGM;
    vi.stubGlobal("document", new EventTarget());
    const entries = [
      { itemUuid: "Item.idol", name: "Ídolo", img: "", linkedRegionIds: [] },
      { itemUuid: "Item.wardrobe", name: "Armário", img: "", linkedRegionIds: [] },
    ];
    requestScene.mockResolvedValue({ entries });
    const panel = new PoiScenePanel("scene");
    const view = panel as unknown as {
      _prepareContext(): Promise<{ entries: Array<{ itemUuid: string; expanded: boolean; matchesSearch: boolean }>; search: string; empty: boolean; noSearchResults: boolean }>;
      _attachPartListeners(part: string, root: HTMLElement, options: object): void;
      _onClose(options: object): void;
    };
    await panel.refresh();
    if (!isGM) {
      const target = { closest: () => ({ dataset: { itemUuid: "Item.idol" } }) } as unknown as HTMLElement;
      await PoiScenePanel.DEFAULT_OPTIONS.actions.toggle.call(panel, {} as PointerEvent, target);
    }
    const first = searchRoot();
    view._attachPartListeners("main", first.root, {});
    vi.mocked(panel.render).mockClear();
    first.type("IDOLO");
    expect(first.rows.map(row => row.hidden)).toEqual([false, true]);
    expect(first.noMatches.hidden).toBe(true);
    expect(requestScene).toHaveBeenCalledTimes(1);
    expect(panel.render).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    const searched = await view._prepareContext();
    expect(searched.search).toBe("IDOLO");
    expect(searched.entries.map(entry => entry.matchesSearch)).toEqual([true, false]);
    expect(searched.entries.map(entry => entry.itemUuid)).toEqual(entries.map(entry => entry.itemUuid));
    await panel.refresh();
    expect(await view._prepareContext()).toMatchObject({ search: "IDOLO" });
    first.type("sem resultado");
    expect(first.rows.every(row => row.hidden)).toBe(true);
    expect(first.noMatches.hidden).toBe(false);
    expect(first.empty.hidden).toBe(true);
    expect(await view._prepareContext()).toMatchObject({ noSearchResults: true, empty: false });
    const second = searchRoot("sem resultado");
    view._attachPartListeners("main", second.root, {});
    first.type("stale input");
    expect((await view._prepareContext()).search).toBe("sem resultado");
    second.type("");
    expect(second.rows.every(row => !row.hidden)).toBe(true);
    expect(second.noMatches.hidden).toBe(true);
    expect(second.empty.hidden).toBe(true);
    const restored = await view._prepareContext();
    expect(restored.entries[0].expanded).toBe(!isGM);
    expect(restored.entries.every(entry => entry.matchesSearch)).toBe(true);
    view._onClose({});
    second.type("closed input");
    expect((await view._prepareContext()).search).toBe("");
  });

  it("distinguishes an empty Scene from an empty search and labels the search field", async () => {
    const { PoiScenePanel } = await import("./poi-scene-panel");
    (game.user as { isGM: boolean }).isGM = false;
    const panel = new PoiScenePanel("scene");
    const view = panel as unknown as {
      _prepareContext(): Promise<object>;
      _attachPartListeners(part: string, root: HTMLElement, options: object): void;
      _onClose(options: object): void;
    };
    await panel.refresh();
    expect(await view._prepareContext()).toMatchObject({ empty: true, noSearchResults: false });
    const search = searchRoot();
    view._attachPartListeners("main", search.root, {});
    search.type("idolo");
    expect(await view._prepareContext()).toMatchObject({ empty: false, noSearchResults: true });
    search.type("");
    expect(search.empty.hidden).toBe(false);
    view._onClose({});
    const template = await readFile(fileURLToPath(new URL("../../../templates/points-of-interest/poi-scene-panel.hbs", import.meta.url)), "utf8");
    expect(template).toMatch(/type="search" name="search"[^>]*placeholder=[^>]*aria-label=/su);
    expect(template.indexOf('name="search"')).toBeLessThan(template.indexOf('class="op2-poi-scene-panel__list"'));
    expect(template).toContain('data-poi-search-empty role="status"');
    const translations = JSON.parse(await readFile(fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url)), "utf8"));
    expect(translations.ORDEMPARANORMAL2.PointOfInterest.ScenePanel.Search).toBe("Pesquisar ponto de interesse...");
    expect(translations.ORDEMPARANORMAL2.PointOfInterest.ScenePanel.NoMatches).not.toBe(translations.ORDEMPARANORMAL2.PointOfInterest.ScenePanel.Empty);
  });
});

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
      querySelector: { value: () => null },
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
    Object.defineProperty(root, "querySelector", { value: () => null });
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

  it("requests Recapitular for the resolved Agent without text or a selector, and respects cancellation", async () => {
    const { PoiScenePanel } = await import("./poi-scene-panel");
    (game.user as { isGM: boolean }).isGM = false;
    resolveAgent.mockReturnValue({ uuid: "Actor.a" });
    requestScene.mockResolvedValue({ entries: [], runId: "run", recapAvailable: true });
    const input = vi.fn().mockResolvedValue(false);
    (foundry.applications.api as typeof foundry.applications.api & { DialogV2: unknown }).DialogV2 = { input } as never;
    const panel = new PoiScenePanel("scene");
    await panel.refresh();
    await PoiScenePanel.DEFAULT_OPTIONS.actions.recap.call(panel);
    expect(requestAction).not.toHaveBeenCalled();
    const dialog = input.mock.calls[0][0] as { content: string; ok: { callback: () => boolean } };
    expect(dialog.content).toContain("RecapPrompt");
    expect(dialog.content).toContain("RecapExplanation");
    expect(dialog.content).not.toMatch(/textarea|select|name="recap"/u);
    input.mockResolvedValueOnce(true);
    await PoiScenePanel.DEFAULT_OPTIONS.actions.recap.call(panel);
    expect(requestAction).toHaveBeenCalledExactlyOnceWith({ kind: "recap", sceneId: "scene",
      runId: "run", actorUuid: "Actor.a" });
  });

  it("keeps five expanded POIs and long clues as independent content rows", async () => {
    const { PoiScenePanel } = await import("./poi-scene-panel");
    (game.user as { isGM: boolean }).isGM = false;
    requestScene.mockResolvedValue({ entries: Array.from({ length: 6 }, (_, index) => ({
      itemUuid: `Item.${index}`, name: `POI ${index}`, img: "", linkedRegionIds: [],
      knownGroups: index % 2 ? [{ skill: "research", clues: [{ text: "Pista longa ".repeat(30) }] }] : [],
    })) });
    const panel = new PoiScenePanel("scene");
    await panel.refresh();
    for (let index = 0; index < 6; index++) {
      const row = { dataset: { itemUuid: `Item.${index}` } };
      const target = { closest: () => row } as unknown as HTMLElement;
      await PoiScenePanel.DEFAULT_OPTIONS.actions.toggle.call(panel, {} as PointerEvent, target);
    }
    const context = await (panel as unknown as { _prepareContext(): Promise<{
      entries: Array<{ itemUuid: string; expanded: boolean; knownGroups: Array<{ clues: Array<{ text: string }> }> }> }> })._prepareContext();
    expect(context.entries).toHaveLength(6);
    expect(context.entries.every(entry => entry.expanded)).toBe(true);
    expect(context.entries[1].knownGroups[0].clues[0].text.length).toBeGreaterThan(200);
    expect(context.entries[0].knownGroups).toEqual([]);
    const css = await readFile(fileURLToPath(new URL("../../../styles/poi-scene-panel.css", import.meta.url)), "utf8");
    expect(css).toMatch(/\.op2-poi-scene-panel__list\s*\{[^}]*display: flex;[^}]*flex-direction: column;/su);
    expect(css).not.toMatch(/\.op2-poi-scene-panel__clues\s*\{[^}]*height:/su);
    const template = await readFile(fileURLToPath(new URL("../../../templates/points-of-interest/poi-scene-panel.hbs", import.meta.url)), "utf8");
    expect(template.match(/fa-chevron-/gu)).toHaveLength(1);
    expect(template).toContain('data-action="share"');
  });
});
