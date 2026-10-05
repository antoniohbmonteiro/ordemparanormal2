import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Handlebars from "handlebars";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SKILL_DEFINITIONS } from "../../config/skills";
import type { AbilityUseData } from "../../core/abilities/ability-use";
import type { AgentSheetViewModel } from "../../ui/actor/agent-sheet-view-model";

const flow = vi.hoisted(() => ({
  useAbility: vi.fn(), publish: vi.fn(), dialog: vi.fn(), adjust: vi.fn(), confirm: vi.fn(),
}));
vi.mock("../../features/abilities/use-ability", () => ({ useAbility: flow.useAbility }));
vi.mock("../../adapters/foundry/chat/publish-ability-message", () => ({ publishAbilityMessage: flow.publish }));
vi.mock("../abilities/ability-use-dialog", () => ({ openAbilityUseDialog: flow.dialog }));
vi.mock("../../adapters/foundry/abilities/adjust-owned-ability-resource", () => ({ adjustOwnedAbilityResource: flow.adjust }));
vi.mock("../profiles/profile-picker", () => ({ confirmProfileReplacement: vi.fn(), ProfilePicker: class {} }));
vi.mock("../occupations/occupation-picker", () => ({ confirmOccupationReplacement: vi.fn(), OccupationPicker: class {} }));
vi.mock("./agent-sheet-settings", () => ({ AgentSheetSettings: class {} }));

interface TestEvent {
  type: string;
  target: TestElement;
  button: number;
  detail: number;
  clientX: number;
  clientY: number;
  stopped: boolean;
  stopPropagation: ReturnType<typeof vi.fn<() => void>>;
  stopImmediatePropagation: ReturnType<typeof vi.fn<() => void>>;
  preventDefault: ReturnType<typeof vi.fn<() => void>>;
}
type Action = (this: TestSheet, event: TestEvent, target: TestElement) => Promise<void>;
type Listener = (event: TestEvent) => void;

// This boundary shim models scoped selectors and bubbling, not browser layout.
class TestElement {
  readonly listeners: Array<{ type: string; listener: Listener }> = [];
  readonly children: TestElement[] = [];
  dataset: Record<string, string> = {};
  constructor(readonly classes = "", readonly parent: TestElement | null = null, readonly tag = "div") {
    parent?.children.push(this);
  }
  closest(selector: string): TestElement | null {
    const matches = selector.split(",").some((part) => {
      const trimmed = part.trim();
      return this.classes.split(" ").includes(trimmed.slice(1));
    });
    return matches ? this : this.parent?.closest(selector) ?? null;
  }
  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      if (child.classes.split(" ").includes(selector.slice(1))) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.push({ type, listener });
  }
  dispatchEvent(event: TestEvent): boolean {
    event.target = this;
    for (let node: TestElement | null = this; node && !event.stopped; node = node.parent) {
      for (const entry of node.listeners) {
        if (entry.type === event.type) entry.listener(event);
        if (event.stopped) break;
      }
    }
    return !event.preventDefault.mock.calls.length;
  }
  emit(type: string, target: TestElement, button = 0): TestEvent {
    const event = pointer(target, button);
    event.type = type;
    target.dispatchEvent(event);
    return event;
  }
}
class TestMouseEvent implements TestEvent {
  target!: TestElement;
  stopped = false;
  readonly button: number;
  readonly detail: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly preventDefault = vi.fn();
  readonly stopPropagation = vi.fn(() => { this.stopped = true; });
  readonly stopImmediatePropagation = vi.fn(() => { this.stopped = true; });
  constructor(readonly type: string, options: MouseEventInit = {}) {
    this.button = options.button ?? 0;
    this.detail = options.detail ?? 0;
    this.clientX = options.clientX ?? 0;
    this.clientY = options.clientY ?? 0;
  }
}
function pointer(target: TestElement, button = 0): TestEvent {
  const event = new TestMouseEvent("click", { button, detail: 1, clientX: 35, clientY: 60 });
  event.target = target;
  return event;
}
interface MenuEntry {
  label: string;
  icon?: string;
  visible?: () => boolean;
  onClick(event: TestEvent, target: TestElement): unknown;
}
interface TestMenu {
  entries: MenuEntry[];
  render: ReturnType<typeof vi.fn<(target: TestElement, options: { event: TestEvent }) => Promise<void>>>;
  close: ReturnType<typeof vi.fn<(options?: object) => Promise<void>>>;
  selector: string;
  element?: { isConnected: boolean };
  target: TestElement | null;
}
const menus: TestMenu[] = [];
class MockContextMenu implements TestMenu {
  static get implementation(): typeof MockContextMenu { return MockContextMenu; }
  element?: { isConnected: boolean };
  target: TestElement | null = null;
  readonly render = vi.fn(async (_target: TestElement, _options: { event: TestEvent }) => {
    this.element = { isConnected: this.entries.some((entry) => !entry.visible || entry.visible()) };
  });
  readonly close = vi.fn(async (_options?: object) => {
    if (!this.element) throw new Error("Cannot close a menu which has never rendered");
    this.element.isConnected = false;
  });
  constructor(container: TestElement, readonly selector: string, readonly entries: MenuEntry[], readonly options: { eventName: string; fixed: boolean; jQuery: boolean }) {
    menus.push(this);
    container.addEventListener(options.eventName, (event) => {
      const target = event.target.closest(selector);
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const prior = this.target;
      this.target = target;
      if (this.element?.isConnected && prior === target) void this.close();
      else {
        if (this.element?.isConnected) void this.close();
        void this.render(target, { event });
      }
    });
  }
}
interface TestItem {
  id: string;
  type: string;
  name: string;
  img: string;
  sort: number;
  isOwner: boolean;
  system: { description: string; uses: AbilityUseData[]; resource: { value: number; max: number } | null };
  sheet: { render: ReturnType<typeof vi.fn> };
}
interface TestActor {
  items: TestItem[];
  deleteEmbeddedDocuments: ReturnType<typeof vi.fn>;
}
interface TestSheet {
  document: TestActor;
  isEditable: boolean;
  editMode: boolean;
  render: ReturnType<typeof vi.fn<(options?: object) => Promise<TestSheet>>>;
  submit: ReturnType<typeof vi.fn>;
  close(): Promise<void>;
  _prepareContext(options: object): Promise<TestContext>;
  _preRender(context: object, options: object): Promise<void>;
  _attachPartListeners(partId: string, element: TestElement, options: object): void;
}
interface TestContext { agent: AgentSheetViewModel; editable: boolean; editMode: boolean; canEditStructure: boolean }
let Sheet: { new(options: { document: object }): TestSheet; DEFAULT_OPTIONS: { actions: Record<string, Action> } };
let renderView: Handlebars.TemplateDelegate;

beforeAll(async () => {
  class MockActorSheetV2 {
    static DEFAULT_OPTIONS = {};
    static PARTS = {};
    static TABS = {};
    id = "sheet-1";
    document: object;
    isEditable = true;
    tabGroups = { content: "abilities" };
    render = vi.fn(async () => this);
    submit = vi.fn(async () => undefined);
    constructor(options: { document: object }) { this.document = options.document; }
    async _prepareContext(): Promise<object> { return { editable: this.isEditable, source: this.document }; }
    async _preRender(): Promise<void> {}
    _attachPartListeners(): void {}
    _createContextMenu(provider: () => MenuEntry[], selector: string, options: { container: TestElement; eventName: string }): TestMenu {
      return new MockContextMenu(options.container, selector, provider(), { ...options, fixed: true, jQuery: false });
    }
    async _preClose(): Promise<void> {}
    _onClose(): void {}
    async close(): Promise<void> { await this._preClose(); this._onClose(); }
  }
  vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("MouseEvent", TestMouseEvent);
  vi.stubGlobal("foundry", { utils: { getType: () => "HTMLElement" }, applications: {
    api: { DialogV2: { confirm: flow.confirm }, HandlebarsApplicationMixin: <T>(base: T) => base },
    sheets: { ActorSheetV2: MockActorSheetV2 },
    ux: { ContextMenu: MockContextMenu, TextEditor: { implementation: { enrichHTML: vi.fn(async (html: string) => html) } } },
  } });
  vi.stubGlobal("document", { createElement: () => {
    const element = { innerHTML: "", textContent: "", get outerHTML() { return `<p>${element.textContent}</p>`; }, get content() { return { textContent: element.innerHTML.replace(/<[^>]*>/g, ""), querySelector: () => null }; } };
    return element;
  } });
  vi.stubGlobal("game", { user: { isGM: true }, i18n: { localize: (key: string) => key, format: (key: string) => key } });
  vi.stubGlobal("ui", { notifications: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } });
  const module = await import("./agent-sheet");
  Sheet = module.AgentSheet as unknown as typeof Sheet;
  const handlebars = Handlebars.create();
  handlebars.registerHelper("localize", (key: string) => key);
  handlebars.registerPartial("systems/ordemparanormal2/templates/actor/partials/die-step-select.hbs",
    await readFile(new URL("../../../templates/actor/partials/die-step-select.hbs", import.meta.url), "utf8"));
  const templates = await Promise.all(["identity", "abilities"].map((part) =>
    readFile(new URL(`../../../templates/actor/agent-sheet-${part}.hbs`, import.meta.url), "utf8")));
  renderView = handlebars.compile(templates.join("\n"));
});
beforeEach(() => {
  vi.clearAllMocks();
  menus.length = 0;
  flow.adjust.mockResolvedValue({ status: "updated", value: 1 });
  flow.confirm.mockResolvedValue(true);
});
function use(id: string): AbilityUseData {
  return { id, name: id, description: "", cost: { source: "none", amount: 0 }, minimumLevel: null, checkIntegration: null };
}
function setup(uses: AbilityUseData[] = []) {
  const ability: TestItem = { id: "ability-1", type: "ability", name: "Habilidade", img: "ability.webp", sort: 0, isOwner: true,
    system: { description: "", uses, resource: { value: 2, max: 3 } }, sheet: { render: vi.fn() } };
  const actor = {
    name: "Agente", img: "agent.webp", type: "agent", items: [ability],
    system: { level: 3, attributes: { physical: 6, mind: 6, emotion: 6 }, resources: { health: { value: 10, max: 10 }, determination: { value: 10, max: 10 } },
      skills: Object.fromEntries(SKILL_DEFINITIONS.map((skill) => [skill.key, "specializations" in skill ? Object.fromEntries(skill.specializations.map(({ key }) => [key, 4])) : 4])) },
    getFlag: vi.fn(), deleteEmbeddedDocuments: vi.fn(),
    getEmbeddedCollection: () => actor.items,
    getEmbeddedDocument: (_type: string, id: string) => actor.items.find((item) => item.id === id) ?? null,
  };
  const sheet = new Sheet({ document: actor });
  const container = new TestElement();
  const row = new TestElement("op2-ability-card", container);
  row.dataset.itemId = ability.id;
  const main = new TestElement("op2-ability-card__use", row, "button");
  main.dataset = { itemId: ability.id, action: "useAbility" };
  const trigger = new TestElement("op2-ability-card__menu-trigger", row, "button");
  trigger.dataset = { itemId: ability.id, action: "openAbilityMenu" };
  const resource = new TestElement("op2-ability-card__resource", row);
  const decrease = new TestElement("op2-ability-card__resource-adjust", resource, "button");
  decrease.dataset = { itemId: ability.id, action: "decreaseAbilityResource", resourceAdjustment: "decrease" };
  const increase = new TestElement("op2-ability-card__resource-adjust", resource, "button");
  increase.dataset = { itemId: ability.id, action: "increaseAbilityResource", resourceAdjustment: "increase" };
  const chevron = new TestElement("op2-ability-card__expand", row, "button");
  chevron.dataset = { itemId: ability.id, action: "toggleAbilityDescription" };
  const details = new TestElement("op2-ability-card__details", row);
  const link = new TestElement("", details, "a");
  const attach = () => sheet._attachPartListeners("main", container, {});
  const click = async (target: TestElement, button = 0) => {
    const event = container.emit("click", target, button);
    if (!event.stopped && target.dataset.action) await action(target.dataset.action).call(sheet, event, target);
    return event;
  };
  return { sheet, ability, actor, container, row, main, trigger, resource, decrease, increase, chevron, details, link, attach, click };
}
function action(name: string): Action {
  const handler = Sheet.DEFAULT_OPTIONS.actions[name];
  if (!handler) throw new Error(`Missing action ${name}`);
  return handler;
}

function renderCycle(sheet: TestSheet) {
  const view = { html: "", context: null as TestContext | null, container: new TestElement() };
  sheet.render.mockImplementation(async () => {
    const context = await sheet._prepareContext({});
    await sheet._preRender(context, {});
    view.context = context;
    view.html = renderView(context);
    view.container = new TestElement();
    for (const ability of context.agent.abilities) {
      const row = new TestElement("op2-ability-card", view.container);
      const surface = new TestElement("op2-ability-card__use", row, "button");
      surface.dataset.itemId = ability.id;
    }
    sheet._attachPartListeners("main", view.container, {});
    return sheet;
  });
  return view;
}

describe("Agent Sheet Edit Mode render regression", () => {
  it("updates the real prepared context and templates on the first pencil action in both directions", async () => {
    const { sheet, trigger } = setup();
    const view = renderCycle(sheet);
    await sheet.render({ force: true });
    const unopened = menus[0]!;
    expect(unopened.element).toBeUndefined();
    expect(view.context).toMatchObject({ editMode: false, canEditStructure: false });
    expect(view.html).toMatch(/data-action="toggleEditMode" aria-pressed="false"/);
    expect(view.html).not.toContain('data-action="openProfilePicker"');

    await action("toggleEditMode").call(sheet, pointer(trigger), trigger);
    expect(unopened.close).not.toHaveBeenCalled();
    expect(view.context).toMatchObject({ editMode: true, canEditStructure: true });
    expect(view.html).toContain('class="op2-edit-mode-toggle is-active"');
    expect(view.html).toMatch(/data-action="toggleEditMode" aria-pressed="true"/);
    expect(view.html).toContain('data-action="openProfilePicker"');
    expect(view.html).toContain('data-action="openOccupationPicker"');
    expect(view.html).toContain('data-action="openAbilityMenu"');

    await action("toggleEditMode").call(sheet, pointer(trigger), trigger);
    expect(view.context).toMatchObject({ editMode: false, canEditStructure: false });
    expect(view.html).not.toContain("op2-edit-mode-toggle is-active");
    expect(view.html).toMatch(/data-action="toggleEditMode" aria-pressed="false"/);
    expect(view.html).not.toContain('data-action="openOccupationPicker"');
    expect(view.html).not.toContain('data-action="openAbilityMenu"');
    expect(sheet.render).toHaveBeenCalledTimes(3);
  });
});

describe.skipIf(!process.env.FOUNDRY_V14_COMMON_PATH)("installed Foundry v14 unopened menu regression", () => {
  it("runs the pencil render cycle without closing a never-rendered native ContextMenu", async () => {
    const commonPath = process.env.FOUNDRY_V14_COMMON_PATH!;
    const nativePath = resolve(dirname(commonPath), "../client/applications/ux/context-menu.mjs");
    const { default: NativeMenu } = await import(/* @vite-ignore */ pathToFileURL(nativePath).href);
    const implementation = vi.spyOn(MockContextMenu, "implementation", "get").mockReturnValue(NativeMenu);
    const close = vi.spyOn(NativeMenu.prototype, "close");
    try {
      const { sheet, trigger } = setup();
      const view = renderCycle(sheet);
      await sheet.render({ force: true });
      await action("toggleEditMode").call(sheet, pointer(trigger), trigger);
      expect(view.context).toMatchObject({ editMode: true, canEditStructure: true });
      expect(view.html).toMatch(/data-action="toggleEditMode" aria-pressed="true"/);
      await action("toggleEditMode").call(sheet, pointer(trigger), trigger);
      expect(view.context).toMatchObject({ editMode: false, canEditStructure: false });
      await sheet.close();
      expect(close).not.toHaveBeenCalled();
    } finally {
      close.mockRestore();
      implementation.mockRestore();
    }
  });
});


describe("Agent Sheet Ability presentation state", () => {
  it("starts collapsed, retains state through rerenders/Edit Mode and clears on close", async () => {
    const { sheet, chevron, click } = setup();
    expect((await sheet._prepareContext({})).agent.abilities[0]?.isExpanded).toBe(false);
    await click(chevron);
    const expanded = await sheet._prepareContext({});
    expect(expanded.agent.abilities[0]?.isExpanded).toBe(true);
    expect(expanded.agent.abilities[0]?.detailsId).toBe("sheet-1-ability-details-ability-1");
    await action("toggleEditMode").call(sheet, pointer(chevron), chevron);
    expect((await sheet._prepareContext({})).agent.abilities[0]?.isExpanded).toBe(true);
    await action("toggleEditMode").call(sheet, pointer(chevron), chevron);
    expect((await sheet._prepareContext({})).agent.abilities[0]?.isExpanded).toBe(true);
    await sheet.close();
    expect((await sheet._prepareContext({})).agent.abilities[0]?.isExpanded).toBe(false);
    expect(flow.publish).not.toHaveBeenCalled();
    expect(flow.useAbility).not.toHaveBeenCalled();
  });

  it("toggles closed again and prunes IDs for removed Items", async () => {
    const { sheet, actor, ability, chevron, click } = setup();
    await click(chevron);
    await click(chevron);
    expect((await sheet._prepareContext({})).agent.abilities[0]?.isExpanded).toBe(false);
    await click(chevron);
    actor.items = [];
    expect((await sheet._prepareContext({})).agent.abilities).toEqual([]);
    actor.items = [ability];
    expect((await sheet._prepareContext({})).agent.abilities[0]?.isExpanded).toBe(false);
  });

  it("allows reading/expansion without edit permission and exposes enriched content in the view model", async () => {
    const { sheet, ability, chevron, click } = setup([use("first"), { ...use("second"), description: "<p>Forma</p>" }]);
    sheet.isEditable = false;
    ability.isOwner = false;
    ability.system.description = "<p>Descrição</p>";
    await click(chevron);
    const { agent } = await sheet._prepareContext({});
    expect(agent.abilities[0]).toMatchObject({ isExpanded: true, descriptionHTML: "<p>Descrição</p>" });
    expect(agent.abilities[0]?.useForms[1]?.descriptionHTML).toBe("<p>Forma</p>");
    expect(sheet.submit).not.toHaveBeenCalled();
  });
});

describe("shared Ability context menu", () => {
  it("uses one instance and the same ordered entries for right-click and the dots", async () => {
    const { sheet, attach, container, main, trigger, click } = setup();
    sheet.editMode = true;
    attach();
    const abilityMenus = menus.filter(({ selector }) => selector.includes("ability"));
    expect(abilityMenus).toHaveLength(1);
    const menu = abilityMenus[0]!;
    const entries = menu.entries;
    expect((menu as MockContextMenu).options).toEqual({ eventName: "contextmenu", fixed: true, jQuery: false });
    expect(entries.map(({ label }) => label)).toEqual(["ORDEMPARANORMAL2.AgentSheet.Abilities.Edit", "ORDEMPARANORMAL2.AgentSheet.Abilities.Delete"]);
    await click(trigger);
    expect(menu.target).toBe(main);
    expect(menu.render).toHaveBeenCalledWith(main, { event: expect.objectContaining({ type: "contextmenu", button: 2, clientX: 35, clientY: 60 }) });
    await menu.close();
    const name = new TestElement("op2-ability-card__name", main);
    const event = container.emit("contextmenu", name, 2);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(menu.render).toHaveBeenCalledWith(main, { event });
    expect(menu.render).toHaveBeenCalledTimes(2);
    expect(menu.entries).toBe(entries);
    expect(menu.render.mock.calls[1]?.[0]).toBe(main);
    expect(flow.useAbility).not.toHaveBeenCalled();
    expect(flow.publish).not.toHaveBeenCalled();
  });

  it("opens by right-click in normal mode and edits/deletes using the existing handlers", async () => {
    const { attach, container, main, row, ability, actor } = setup();
    attach();
    const menu = menus[0]!;
    const event = container.emit("contextmenu", main, 2);
    await menu.entries[0]!.onClick(event, row);
    expect(ability.sheet.render).toHaveBeenCalledWith(true);
    await menu.entries[1]!.onClick(event, row);
    expect(flow.confirm).toHaveBeenCalledOnce();
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", [ability.id]);
  });

  it("creates no menu without permission and guards opening and captured execution after permission is lost", async () => {
    const readOnly = setup();
    readOnly.sheet.isEditable = false;
    readOnly.sheet.editMode = true;
    readOnly.attach();
    expect(menus).toHaveLength(0);
    readOnly.container.emit("contextmenu", readOnly.main, 2);
    await readOnly.click(readOnly.trigger);
    expect(menus).toHaveLength(0);
    const editable = setup();
    editable.sheet.editMode = true;
    editable.attach();
    const menu = menus[0]!;
    editable.sheet.isEditable = false;
    editable.container.emit("contextmenu", editable.main, 2);
    await editable.click(editable.trigger);
    for (const entry of menu.entries) await entry.onClick(pointer(editable.row), editable.row);
    expect(menu.element?.isConnected).toBe(false);
    expect(menu.entries.every((entry) => entry.visible?.() === false)).toBe(true);
    expect(editable.ability.sheet.render).not.toHaveBeenCalled();
    expect(editable.actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(flow.confirm).not.toHaveBeenCalled();
  });

  it("rechecks edit permission after deletion confirmation and preserves cancellation", async () => {
    const { sheet, attach, row, actor } = setup();
    attach();
    flow.confirm.mockResolvedValueOnce(false);
    await menus[0]!.entries[1]!.onClick(pointer(row), row);
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    flow.confirm.mockImplementationOnce(async () => { sheet.isEditable = false; return true; });
    await menus[0]!.entries[1]!.onClick(pointer(row), row);
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("ignores right-click on every internal control without opening or using anything", () => {
    const fixture = setup();
    fixture.attach();
    for (const target of [fixture.resource, fixture.decrease, fixture.increase, fixture.chevron, fixture.trigger, fixture.details, fixture.link]) {
      const event = fixture.container.emit("contextmenu", target, 2);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }
    expect(menus[0]!.render).not.toHaveBeenCalled();
    expect(flow.useAbility).not.toHaveBeenCalled();
    expect(flow.adjust).not.toHaveBeenCalled();
  });

  it("closes an open menu before replacing its part and when closing the sheet", async () => {
    const { sheet } = setup();
    const view = renderCycle(sheet);
    await sheet.render({ force: true });
    const old = menus[0]!;
    view.container.emit("contextmenu", view.container.querySelector(".op2-ability-card__use")!, 2);
    await sheet.render({ force: true });
    expect(old.close).toHaveBeenCalledOnce();
    expect(old.close).toHaveBeenCalledWith({ animate: false });
    const current = menus[1]!;
    expect(old.render).toHaveBeenCalledOnce();
    view.container.emit("contextmenu", view.container.querySelector(".op2-ability-card__use")!, 2);
    expect(current.render).toHaveBeenCalledOnce();
    await sheet.close();
    expect(current.close).toHaveBeenCalledOnce();
    expect(current.element?.isConnected).toBe(false);
    expect(old.element?.isConnected).toBe(false);
  });

  it("does not close a previously closed menu again during replacement or sheet close", async () => {
    const { sheet } = setup();
    const view = renderCycle(sheet);
    await sheet.render({ force: true });
    const old = menus[0]!;
    view.container.emit("contextmenu", view.container.querySelector(".op2-ability-card__use")!, 2);
    await old.close();
    await sheet.render({ force: true });
    await sheet.close();
    expect(old.close).toHaveBeenCalledOnce();
    expect(menus[1]!.close).not.toHaveBeenCalled();
  });

  it("targets a different Ability when alternating native right-click and keyboard dots", async () => {
    const { sheet, ability, actor, attach, container, main, trigger, click } = setup();
    sheet.editMode = true;
    const second = { ...ability, id: "ability-2", sheet: { render: vi.fn() } };
    actor.items.push(second);
    const row = new TestElement("op2-ability-card", container);
    const surface = new TestElement("op2-ability-card__use", row, "button");
    surface.dataset.itemId = second.id;
    const dots = new TestElement("op2-ability-card__menu-trigger", row, "button");
    dots.dataset.action = "openAbilityMenu";
    attach();
    container.emit("contextmenu", main, 2);
    const menu = menus[0]!;
    await menu.entries[0]!.onClick(pointer(main), menu.target!);
    const keyboard = pointer(dots);
    keyboard.detail = 0;
    await action("openAbilityMenu").call(sheet, keyboard, dots);
    expect(menu.target).toBe(surface);
    expect(menu.render.mock.calls.at(-1)?.[1]).toMatchObject({ event: { clientX: 0, clientY: 0 } });
    await menu.entries[0]!.onClick(pointer(surface), menu.target!);
    expect(ability.sheet.render).toHaveBeenCalledOnce();
    expect(second.sheet.render).toHaveBeenCalledOnce();
    await click(trigger, 2);
    expect(menu.target).toBe(surface);
    expect(flow.useAbility).not.toHaveBeenCalled();
  });

  it("rejects dots outside Edit Mode, without a live instance or for a removed Ability", async () => {
    const { sheet, attach, actor, trigger, click } = setup();
    attach();
    await click(trigger);
    expect(menus[0]!.render).not.toHaveBeenCalled();
    sheet.editMode = true;
    actor.items = [];
    await click(trigger);
    expect(menus[0]!.render).not.toHaveBeenCalled();
    await sheet.close();
    await click(trigger);
    expect(menus[0]!.render).not.toHaveBeenCalled();
  });
});

describe("Ability row functional routing", () => {
  it("routes a primary/keyboard-generated click through the existing use and publication flow", async () => {
    const first = use("first");
    const { ability, actor, attach, main, click } = setup([first]);
    flow.useAbility.mockResolvedValue({ status: "success", use: first, source: "none", amount: 0, remaining: null });
    attach();
    await click(main);
    expect(flow.useAbility).toHaveBeenCalledWith(actor, ability, first.id);
    expect(flow.publish).toHaveBeenCalledWith(actor, ability, expect.objectContaining({ status: "success" }));
    expect(flow.dialog).not.toHaveBeenCalled();
  });

  it("keeps multiple standalone forms in the existing selection dialog", async () => {
    const forms = [use("first"), use("second"), { ...use("check"), checkIntegration: { modification: { type: "extraDie" as const, applicability: { type: "any" as const }, die: 6 as const } } }];
    const { ability, attach, main, click } = setup(forms);
    attach();
    await click(main);
    expect(flow.dialog).toHaveBeenCalledWith(ability, forms.slice(0, 2), 3, { value: 2, max: 3 }, expect.any(Function));
    expect(flow.useAbility).not.toHaveBeenCalled();
  });

  it.each([0, 2])("opens both independent Ímpeto forms in order with resource %i/3 before paying", async (value) => {
    const forms: AbilityUseData[] = [
      { ...use("impetus-add-d4"), name: "Adicionar d4", cost: { source: "resource", amount: 1 } },
      { ...use("impetus-raise-attribute"), name: "Elevar atributo", cost: { source: "resource", amount: 3 } },
    ];
    const { ability, main, click } = setup(forms);
    ability.name = "Ímpeto";
    ability.system.resource = { value, max: 3 };
    await click(main);
    expect(flow.dialog).toHaveBeenCalledExactlyOnceWith(ability, forms, 3, { value, max: 3 }, expect.any(Function));
    expect(flow.useAbility).not.toHaveBeenCalled();
    expect(flow.publish).not.toHaveBeenCalled();
    expect(ability.system.resource.value).toBe(value);
  });

  it.each(["impetus-add-d4", "impetus-raise-attribute", null])("routes selection %s through the real dialog and existing use callback", async (selectedId) => {
    const forms: AbilityUseData[] = [
      { ...use("impetus-add-d4"), name: "Adicionar d4", cost: { source: "resource", amount: 1 } },
      { ...use("impetus-raise-attribute"), name: "Elevar atributo", cost: { source: "resource", amount: 3 } },
    ];
    const { sheet, ability, actor, main, click } = setup(forms);
    ability.name = "Ímpeto";
    const selected = forms.find(({ id }) => id === selectedId);
    const affordable = selected?.cost.amount === 1;
    if (selected) flow.useAbility.mockResolvedValue(affordable
      ? { status: "success", use: selected, source: "resource", amount: 1, remaining: 1 }
      : { status: "insufficient", source: "resource", required: 3, available: 2 });
    const realDialog = await vi.importActual<typeof import("../abilities/ability-use-dialog")>("../abilities/ability-use-dialog");
    flow.dialog.mockImplementationOnce(realDialog.openAbilityUseDialog);
    const application = foundry.applications;
    const wait = vi.fn(async (config: {
      render: (event: Event, dialog: unknown) => void;
      close: () => boolean;
    }) => {
      const buttons = forms.map(({ id }) => ({ dataset: { useId: id }, disabled: false,
        click: undefined as (() => Promise<void>) | undefined,
        addEventListener(_type: string, listener: () => Promise<void>) { this.click = listener; },
      }));
      const close = vi.fn(async () => undefined);
      config.render(new Event("render"), { element: { querySelectorAll: () => buttons }, close });
      expect(flow.useAbility).not.toHaveBeenCalled();
      await buttons.find(({ dataset }) => dataset.useId === selectedId)?.click?.();
      expect(close).toHaveBeenCalledTimes(affordable ? 1 : 0);
      if (!affordable) expect(buttons.every(({ disabled }) => !disabled)).toBe(true);
      return config.close();
    });
    const renderTemplate = vi.fn(async (_path: string, view: object) => {
      const template = await readFile(new URL("../../../templates/abilities/ability-use-dialog.hbs", import.meta.url), "utf8");
      const handlebars = Handlebars.create();
      handlebars.registerHelper("localize", (key: string) => key);
      return handlebars.compile(template)(view);
    });
    const globals = foundry as unknown as { applications: unknown };
    globals.applications = { ...application, api: { ...application.api, DialogV2: { ...application.api.DialogV2, wait } }, handlebars: { renderTemplate } };
    try {
      await click(main);
      expect(wait).toHaveBeenCalledOnce();
      expect(renderTemplate).toHaveBeenCalledWith("systems/ordemparanormal2/templates/abilities/ability-use-dialog.hbs", expect.objectContaining({ resource: { value: 2, max: 3 }, uses: [expect.objectContaining({ id: forms[0]!.id, locked: false }), expect.objectContaining({ id: forms[1]!.id, locked: false })] }));
      if (selected) {
        expect(flow.useAbility).toHaveBeenCalledExactlyOnceWith(actor, ability, selected.id);
        if (affordable) {
          expect(flow.publish).toHaveBeenCalledExactlyOnceWith(actor, ability, expect.objectContaining({ use: selected }));
          expect(sheet.render).toHaveBeenCalledWith({ force: true });
        } else {
          expect(flow.publish).not.toHaveBeenCalled();
          expect(sheet.render).not.toHaveBeenCalled();
          expect(ability.system.resource).toEqual({ value: 2, max: 3 });
        }
      } else {
        expect(flow.useAbility).not.toHaveBeenCalled();
        expect(flow.publish).not.toHaveBeenCalled();
        expect(sheet.render).not.toHaveBeenCalled();
        expect(ability.system.resource).toEqual({ value: 2, max: 3 });
      }
    } finally {
      globals.applications = application;
    }
  });

  it("keeps canonical Ímpeto's integrated d4 in checks and executes only its standalone form", async () => {
    const source = JSON.parse(await readFile(new URL("../../../packs-src/abilities/impeto.json", import.meta.url), "utf8"));
    const { ability, actor, main, click } = setup(source.system.uses);
    ability.name = source.name;
    flow.useAbility.mockResolvedValue({ status: "insufficient", source: "resource", required: 3, available: 2 });
    await click(main);
    expect(flow.dialog).not.toHaveBeenCalled();
    expect(flow.useAbility).toHaveBeenCalledExactlyOnceWith(actor, ability, "impetus-raise-attribute");
    expect(flow.publish).not.toHaveBeenCalled();
    expect(ability.system.resource).toEqual({ value: 2, max: 3 });
  });

  it.each([false, true])("preserves publication without payment with check-only forms: %s", async (checkOnly) => {
    const check = { ...use("check"), checkIntegration: { modification: { type: "extraDie" as const, applicability: { type: "any" as const }, die: 4 as const } } };
    const { ability, actor, main, click } = setup(checkOnly ? [check] : []);
    await click(main);
    expect(flow.dialog).not.toHaveBeenCalled();
    expect(flow.useAbility).not.toHaveBeenCalled();
    expect(flow.publish).toHaveBeenCalledExactlyOnceWith(actor, ability);
  });

  it("uses neither a non-primary click nor any internal control to execute an Ability", async () => {
    const { sheet, attach, main, decrease, increase, resource, chevron, trigger, link, click } = setup();
    attach();
    await click(main, 2);
    await click(resource);
    await click(decrease);
    await click(increase);
    await click(chevron);
    sheet.editMode = true;
    await click(trigger);
    await click(link);
    expect(flow.useAbility).not.toHaveBeenCalled();
    expect(flow.publish).not.toHaveBeenCalled();
    expect(flow.adjust).toHaveBeenCalledTimes(2);
    expect(flow.adjust.mock.calls.map((call) => call[2])).toEqual([-1, 1]);
  });

  it("blocks use and adjustments without edit permission", async () => {
    const { sheet, main, decrease, increase, click } = setup([use("first")]);
    sheet.isEditable = false;
    await click(main);
    await click(decrease);
    await click(increase);
    expect(flow.useAbility).not.toHaveBeenCalled();
    expect(flow.adjust).not.toHaveBeenCalled();
    expect(flow.publish).not.toHaveBeenCalled();
  });
});
