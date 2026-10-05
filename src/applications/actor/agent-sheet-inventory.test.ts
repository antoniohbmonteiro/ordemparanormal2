import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SKILL_DEFINITIONS } from "../../config/skills";
import type { EquipmentCategory } from "../../core/equipment/equipment-category";
import translations from "../../../lang/pt-BR.json";
import type { AgentSheetViewModel } from "../../ui/actor/agent-sheet-view-model";

const flow = vi.hoisted(() => ({
  publish: vi.fn(), confirm: vi.fn(), enrichHTML: vi.fn(async (html: string) => html),
}));
vi.mock("../../features/equipment/use-equipment", () => ({ useEquipment: flow.publish,
  equipmentUseFeedback: () => null }));
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
  system: { description: string; category: EquipmentCategory; quantity: number | null; uses: { value: number; max: number } | null; useForms: readonly unknown[] };
  update: ReturnType<typeof vi.fn>;
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
    tabGroups = { content: "inventory" };
    changeTab(id: string) { this.tabGroups.content = id; }
    render = vi.fn(async () => this);
    submit = vi.fn(async () => undefined);
    constructor(options: { document: object }) { this.document = options.document; }
    async _prepareContext(): Promise<object> { return { editable: this.isEditable, source: this.document }; }
    async _preRender(): Promise<void> {}
    _attachPartListeners(): void {}
    async _preClose(): Promise<void> {}
    _onClose(): void {}
    async close(): Promise<void> { await this._preClose(); this._onClose(); }
  }
  vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("MouseEvent", TestMouseEvent);
  vi.stubGlobal("foundry", { utils: { getType: () => "HTMLElement" }, applications: {
    api: { DialogV2: { confirm: flow.confirm }, HandlebarsApplicationMixin: <T>(base: T) => base },
    sheets: { ActorSheetV2: MockActorSheetV2 },
    ux: { ContextMenu: MockContextMenu, TextEditor: { implementation: { enrichHTML: flow.enrichHTML } } },
  } });
  vi.stubGlobal("document", { createElement: () => {
    const element = { innerHTML: "", textContent: "", get outerHTML() { return `<p>${element.textContent}</p>`; }, get content() { return { textContent: element.innerHTML.replace(/<[^>]*>/g, ""), querySelector: () => null }; } };
    return element;
  } });
  vi.stubGlobal("game", { user: { isGM: true }, users: { activeGM: null },
    i18n: { localize: (key: string) => key, format: (key: string) => key } });
  vi.stubGlobal("ui", { notifications: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } });
  const module = await import("./agent-sheet");
  Sheet = module.AgentSheet as unknown as typeof Sheet;
  const handlebars = Handlebars.create();
  handlebars.registerHelper("localize", (key: string) => key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], translations));
  handlebars.registerPartial("systems/ordemparanormal2/templates/actor/partials/die-step-select.hbs",
    await readFile(new URL("../../../templates/actor/partials/die-step-select.hbs", import.meta.url), "utf8"));
  const templates = await Promise.all(["identity", "inventory"].map((part) =>
    readFile(new URL(`../../../templates/actor/agent-sheet-${part}.hbs`, import.meta.url), "utf8")));
  renderView = handlebars.compile(templates.join("\n"));
});
beforeEach(() => {
  vi.clearAllMocks();
  menus.length = 0;
  flow.enrichHTML.mockReset().mockImplementation(async html => html);
  flow.confirm.mockResolvedValue(true);
});

function equipment(id = "equipment-1", overrides: Partial<TestItem["system"]> = {}): TestItem {
  const item: TestItem = {
    id, type: "equipment", name: "Ferramenta", img: "tool.webp", sort: 0, isOwner: true,
    system: { description: "<p>Descrição</p>", category: "tool", quantity: 2, uses: { value: 2, max: 3 }, useForms: [], ...overrides },
    sheet: { render: vi.fn() },
    update: vi.fn(async (change: Record<string, unknown>) => {
      if (Object.hasOwn(change, "system.quantity")) item.system.quantity = change["system.quantity"] as number;
      if (Object.hasOwn(change, "system.uses.value")) item.system.uses!.value = change["system.uses.value"] as number;
    }),
  };
  return item;
}

function setup(items = [equipment()]) {
  const actor = {
    name: "Agente", img: "agent.webp", type: "agent", items,
    system: { level: 3, attributes: { physical: 6, mind: 6, emotion: 6 }, resources: { health: { value: 10, max: 10 }, determination: { value: 10, max: 10 } },
      skills: Object.fromEntries(SKILL_DEFINITIONS.map(skill => [skill.key, "specializations" in skill ? Object.fromEntries(skill.specializations.map(({ key }) => [key, 4])) : 4])) },
    getFlag: vi.fn(), deleteEmbeddedDocuments: vi.fn(),
    getEmbeddedCollection: () => actor.items,
    getEmbeddedDocument: (_type: string, id: string) => actor.items.find(item => item.id === id) ?? null,
  };
  const sheet = new Sheet({ document: actor });
  const container = new TestElement();
  const rows = items.map(item => createRow(container, item.id));
  const attach = () => sheet._attachPartListeners("main", container, {});
  return { sheet, actor, container, rows, attach };
}

function createRow(container: TestElement, id: string) {
  const row = new TestElement("op2-equipment-card", container);
  row.dataset.itemId = id;
  const button = (className: string, parent: TestElement, action: string) => {
    const element = new TestElement(className, parent, "button");
    element.dataset = { itemId: id, action };
    return element;
  };
  const main = button("op2-equipment-card__use", row, "useEquipment");
  const image = new TestElement("op2-equipment-card__image", main);
  const name = new TestElement("op2-equipment-card__name", main);
  const quantity = new TestElement("op2-equipment-card__quantity", row);
  const decreaseQuantity = button("op2-equipment-card__quantity-adjust", quantity, "decreaseEquipmentQuantity");
  decreaseQuantity.dataset.quantityAdjustment = "decrease";
  const increaseQuantity = button("op2-equipment-card__quantity-adjust", quantity, "increaseEquipmentQuantity");
  increaseQuantity.dataset.quantityAdjustment = "increase";
  const uses = new TestElement("op2-equipment-card__uses", row);
  const decreaseUses = button("op2-equipment-card__uses-adjust", uses, "decreaseEquipmentUses");
  decreaseUses.dataset.resourceAdjustment = "decrease";
  const increaseUses = button("op2-equipment-card__uses-adjust", uses, "increaseEquipmentUses");
  increaseUses.dataset.resourceAdjustment = "increase";
  const trigger = button("op2-equipment-card__menu-trigger", row, "openEquipmentMenu");
  const chevron = button("op2-equipment-card__expand", row, "toggleEquipmentDescription");
  const details = new TestElement("op2-equipment-card__details", row);
  const link = new TestElement("", details, "a");
  return { row, main, image, name, quantity, decreaseQuantity, increaseQuantity, uses, decreaseUses, increaseUses, trigger, chevron, details, link };
}

function action(name: string): Action {
  const handler = Sheet.DEFAULT_OPTIONS.actions[name];
  if (!handler) throw new Error(`Missing action ${name}`);
  return handler;
}
async function click(sheet: TestSheet, container: TestElement, target: TestElement, button = 0) {
  const event = container.emit("click", target, button);
  const control = target.dataset.action ? target : target.closest(".op2-equipment-card__use");
  if (!event.stopped && control?.dataset.action) await action(control.dataset.action).call(sheet, event, control);
  return event;
}
function inventoryMenu() { return menus.find(menu => menu.selector === ".op2-equipment-card__use")!; }

function renderCycle(sheet: TestSheet) {
  const view = { html: "", context: null as TestContext | null, container: new TestElement(), rows: [] as ReturnType<typeof createRow>[] };
  sheet.render.mockImplementation(async () => {
    const context = await sheet._prepareContext({});
    await sheet._preRender(context, {});
    view.context = context;
    view.html = renderView(context);
    view.container = new TestElement();
    view.rows = context.agent.equipment.map(card => createRow(view.container, card.id));
    sheet._attachPartListeners("main", view.container, {});
    return sheet;
  });
  return view;
}

describe("Agent Sheet Inventory presentation and state", () => {
  it.each([["general"], ["weapon"], ["tool"], ["tool", "general"], ["tool", "weapon", "general"], []] as EquipmentCategory[][])(
    "renders only populated sections in canonical order for %s", async (...categories) => {
      const items = categories.map((category, index) => equipment(`${index}`, { category }));
      const { sheet } = setup(items);
      const output = renderView(await sheet._prepareContext({}));
      const expected = ["general", "weapon", "tool"].filter(category => categories.includes(category as EquipmentCategory));
      const matches = [...output.matchAll(/class="op2-inventory__section-label"[^>]*>([^<]+)<\/h3>/g)].map(match => match[1]);
      expect(matches).toEqual(expected.map(category => translations.ORDEMPARANORMAL2.AgentSheet.Inventory.Sections[category as EquipmentCategory]));
      expect(output.match(/class="op2-inventory__columns"/g)?.length ?? 0).toBe(categories.length ? 1 : 0);
      if (!categories.length) expect(output).toContain("Nenhum item no inventário.");
      expect(output).not.toContain("op2-ability-card");
    },
  );

  it("renders neutral cells without false counters and real zero/uses with accessible limits", async () => {
    const plain = equipment("plain", { quantity: null, uses: null, description: "" });
    const counter = equipment("counter", { quantity: 0 });
    const { sheet } = setup([plain, counter]);
    const context = await sheet._prepareContext({});
    const output = renderView(context);
    const rows = output.match(/<article class="op2-equipment-card"[\s\S]*?<\/article>/g)!;
    expect(rows[0]!.match(/class="op2-equipment-card__neutral"/g)).toHaveLength(2);
    expect(rows[0]).not.toContain('role="meter"');
    expect(rows[0]).not.toContain("quantity-controls");
    expect(rows[0]).not.toContain("uses-controls");
    expect(rows[1]).toContain('aria-valuetext="2 / 3"');
    expect(rows[1]).toContain('width: 66.67%;');
    expect(rows[1]).toMatch(/data-action="decreaseEquipmentQuantity"[^>]*disabled/);
    expect(rows[1]).toContain('aria-label="Quantidade: 0"');
    const main = rows[1]!.match(/<button class="op2-equipment-card__use"[\s\S]*?<\/button>/)![0];
    expect(main).toContain('src="tool.webp"');
    expect(main).toContain('aria-hidden="true">Usar');
    for (const marker of ["quantity", "uses-controls", "toggleEquipmentDescription", "openEquipmentMenu", "description"]) expect(main).not.toContain(marker);
  });

  it("enriches descriptions relative to their own Item, respects secrets and omits empty results", async () => {
    const first = equipment("owner");
    const observer = equipment("observer");
    observer.isOwner = false;
    const blank = equipment("blank", { description: "  " });
    const empty = equipment("empty", { description: "<p> </p>" });
    const { sheet } = setup([first, observer, blank, empty]);
    const context = await sheet._prepareContext({});
    expect(flow.enrichHTML).toHaveBeenCalledWith(first.system.description, { relativeTo: first, secrets: true });
    expect(flow.enrichHTML).toHaveBeenCalledWith(observer.system.description, { relativeTo: observer, secrets: false });
    expect(flow.enrichHTML).toHaveBeenCalledTimes(3);
    expect(context.agent.equipment[2]?.descriptionHTML).toBe("");
    expect(context.agent.equipment[3]?.descriptionHTML).toBe("");
    expect(context.agent.equipmentSections[0]?.items).toEqual(context.agent.equipment);
    expect(renderView(context).match(/class="op2-equipment-card__description"/g)).toHaveLength(2);
  });

  it("preserves expansion across rerenders, tabs and Edit Mode, then prunes and clears it", async () => {
    const item = equipment();
    const { sheet, actor } = setup([item]);
    const view = renderCycle(sheet);
    await sheet.render({ force: true });
    expect(view.context!.agent.equipment[0]?.isExpanded).toBe(false);
    await click(sheet, view.container, view.rows[0]!.chevron);
    expect(view.context!.agent.equipment[0]?.isExpanded).toBe(true);
    expect(view.html).toContain('aria-expanded="true"');
    const tab = new TestElement();
    tab.dataset.tab = "abilities";
    await action("selectAgentTab").call(sheet, pointer(tab), tab);
    tab.dataset.tab = "inventory";
    await action("selectAgentTab").call(sheet, pointer(tab), tab);
    expect(view.context!.agent.equipment[0]?.isExpanded).toBe(true);
    await action("toggleEditMode").call(sheet, pointer(tab), tab);
    expect(view.context).toMatchObject({ editMode: true, canEditStructure: true });
    expect(view.html).toContain('data-action="openEquipmentMenu"');
    expect(view.html).not.toContain('data-action="toggleEquipmentDescription"');
    expect(view.html).toMatch(/is-active[\s\S]*?aria-pressed="true"/);
    await action("toggleEditMode").call(sheet, pointer(tab), tab);
    expect(view.context!.agent.equipment[0]?.isExpanded).toBe(true);
    actor.items = [];
    await sheet.render();
    actor.items = [item];
    await sheet.render();
    expect(view.context!.agent.equipment[0]?.isExpanded).toBe(false);
    await click(sheet, view.container, view.rows[0]!.chevron);
    item.type = "pointOfInterest";
    await sheet.render();
    item.type = "equipment";
    await sheet.render();
    expect(view.context!.agent.equipment[0]?.isExpanded).toBe(false);
    await click(sheet, view.container, view.rows[0]!.chevron);
    await sheet.close();
    expect((await sheet._prepareContext({})).agent.equipment[0]?.isExpanded).toBe(false);
    expect(item.update).not.toHaveBeenCalled();
  });

  it("supports read-only expansion and hides menus and adjustment controls", async () => {
    const { sheet, container, rows, attach } = setup();
    sheet.isEditable = false;
    attach();
    await click(sheet, container, rows[0]!.chevron);
    const output = renderView(await sheet._prepareContext({}));
    expect(output).toContain('aria-expanded="true"');
    expect(output).toMatch(/data-action="useEquipment"[^>]*disabled/);
    expect(output).not.toContain("quantity-controls");
    expect(output).not.toContain("uses-controls");
    expect(output).not.toContain("menu-trigger");
    expect(menus).toHaveLength(0);
  });
});

describe("Agent Sheet Inventory actions and menus", () => {
  it("uses image/name only on primary activation, including keyboard, without consuming counters", async () => {
    const item = equipment(undefined, { quantity: 0 });
    const { sheet, actor, container, rows, attach } = setup([item]);
    attach();
    await click(sheet, container, rows[0]!.image);
    await click(sheet, container, rows[0]!.name);
    await action("useEquipment").call(sheet, new TestMouseEvent("click", { detail: 0 }), rows[0]!.main);
    expect(flow.publish).toHaveBeenCalledTimes(3);
    expect(flow.publish).toHaveBeenCalledWith(actor, item.id);
    expect(item.update).not.toHaveBeenCalled();
    await click(sheet, container, rows[0]!.main, 2);
    container.emit("contextmenu", rows[0]!.main, 2);
    expect(flow.publish).toHaveBeenCalledTimes(3);
  });

  it("serializes quantity and uses updates against current state and preserves forms", async () => {
    const item = equipment();
    const { sheet, container, rows } = setup([item]);
    await Promise.all([
      click(sheet, container, rows[0]!.decreaseQuantity),
      click(sheet, container, rows[0]!.decreaseQuantity),
      click(sheet, container, rows[0]!.increaseUses),
      click(sheet, container, rows[0]!.increaseUses),
    ]);
    expect(item.system.quantity).toBe(0);
    expect(item.system.uses).toEqual({ value: 3, max: 3 });
    expect(item.system.useForms).toEqual([]);
    expect(item.update.mock.calls).toEqual([[{ "system.quantity": 1 }], [{ "system.quantity": 0 }], [{ "system.uses.value": 3 }]]);
    expect(flow.publish).not.toHaveBeenCalled();
  });

  it("excludes cells, controls and details from use and native menu activation", async () => {
    const { sheet, actor, container, rows, attach } = setup();
    attach();
    const row = rows[0]!;
    for (const control of [row.quantity, row.uses, row.details, row.link]) await click(sheet, container, control);
    for (const control of [row.quantity, row.uses, row.decreaseQuantity, row.increaseQuantity, row.decreaseUses, row.increaseUses, row.chevron, row.trigger, row.details, row.link]) {
      container.emit("contextmenu", control, 2);
      if (control.dataset.action) await click(sheet, container, control, 2);
    }
    expect(inventoryMenu().render).not.toHaveBeenCalled();
    expect(actor.items[0]!.update).not.toHaveBeenCalled();
    expect(flow.publish).not.toHaveBeenCalled();
    await click(sheet, container, row.chevron);
    expect(flow.publish).not.toHaveBeenCalled();
  });

  it("shares a single Equipment instance and entries between dots and right-click, separate from Ability", async () => {
    const { sheet, container, rows, attach } = setup([equipment("a"), equipment("b")]);
    sheet.editMode = true;
    attach();
    const menu = inventoryMenu() as MockContextMenu;
    expect(menus.filter(menu => menu.selector === ".op2-equipment-card__use")).toHaveLength(1);
    expect(menus.find(menu => menu.selector === ".op2-ability-card__use")).not.toBe(menu);
    expect(menu.options).toEqual({ eventName: "contextmenu", fixed: true, jQuery: false });
    const entries = menu.entries;
    await click(sheet, container, rows[0]!.trigger);
    expect(menu.render).toHaveBeenLastCalledWith(rows[0]!.main, { event: expect.objectContaining({ type: "contextmenu", clientX: 35, clientY: 60 }) });
    const event = container.emit("contextmenu", rows[1]!.image, 2);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(menu.render).toHaveBeenLastCalledWith(rows[1]!.main, { event });
    expect(menu.close).toHaveBeenCalledTimes(1);
    expect(menu.entries).toBe(entries);
    expect(entries.map(entry => entry.label)).toEqual(["ORDEMPARANORMAL2.AgentSheet.Inventory.Edit", "ORDEMPARANORMAL2.AgentSheet.Inventory.Delete"]);
    expect(entries.map(entry => entry.icon)).toEqual(['<i class="fa-solid fa-pen"></i>', '<i class="fa-solid fa-trash"></i>']);
    expect(flow.publish).not.toHaveBeenCalled();
    const keyboard = new TestMouseEvent("click", { detail: 0 });
    await action("openEquipmentMenu").call(sheet, keyboard, rows[0]!.trigger);
    expect(menu.render).toHaveBeenLastCalledWith(rows[0]!.main, { event: expect.objectContaining({ clientX: 0, clientY: 0 }) });
  });

  it("allows right-click editing outside Edit Mode but requires it for dots", async () => {
    const item = equipment();
    const { sheet, container, rows, attach } = setup([item]);
    attach();
    const menu = inventoryMenu();
    await click(sheet, container, rows[0]!.trigger);
    expect(menu.render).not.toHaveBeenCalled();
    container.emit("contextmenu", rows[0]!.name, 2);
    await menu.entries[0]!.onClick(pointer(rows[0]!.main), rows[0]!.main);
    expect(item.sheet.render).toHaveBeenCalledWith(true);
    expect(flow.publish).not.toHaveBeenCalled();
  });

  it("cleans unopened, open, closed and replaced menus without breaking immediate Edit Mode rendering", async () => {
    const { sheet } = setup();
    const view = renderCycle(sheet);
    await sheet.render();
    const unopened = inventoryMenu();
    const control = view.rows[0]!.trigger;
    await action("toggleEditMode").call(sheet, pointer(control), control);
    expect(unopened.close).not.toHaveBeenCalled();
    expect(view.context!.canEditStructure).toBe(true);
    const menu = menus.filter(menu => menu.selector === ".op2-equipment-card__use").at(-1)!;
    await click(sheet, view.container, view.rows[0]!.trigger);
    await sheet.render();
    expect(menu.close).toHaveBeenCalledWith({ animate: false });
    const next = menus.filter(menu => menu.selector === ".op2-equipment-card__use").at(-1)!;
    view.container.emit("contextmenu", view.rows[0]!.main, 2);
    await next.close();
    await sheet.close();
    expect(next.close).toHaveBeenCalledTimes(1);
  });

  it("rechecks entry visibility and handlers after permission loss, including confirmation and queued work", async () => {
    const item = equipment();
    const { sheet, actor, container, rows, attach } = setup([item]);
    attach();
    const menu = inventoryMenu();
    sheet.isEditable = false;
    expect(menu.entries.every(entry => entry.visible?.() === false)).toBe(true);
    container.emit("contextmenu", rows[0]!.main, 2);
    expect(menu.element?.isConnected).toBe(false);
    await menu.entries[0]!.onClick(pointer(rows[0]!.main), rows[0]!.main);
    await menu.entries[1]!.onClick(pointer(rows[0]!.main), rows[0]!.main);
    expect(item.sheet.render).not.toHaveBeenCalled();
    expect(flow.confirm).not.toHaveBeenCalled();
    sheet.isEditable = true;
    flow.confirm.mockResolvedValueOnce(false);
    await menu.entries[1]!.onClick(pointer(rows[0]!.main), rows[0]!.main);
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    flow.confirm.mockImplementationOnce(async () => { sheet.isEditable = false; return true; });
    await menu.entries[1]!.onClick(pointer(rows[0]!.main), rows[0]!.main);
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    sheet.isEditable = true;
    sheet.submit.mockImplementationOnce(async () => { sheet.isEditable = false; });
    await click(sheet, container, rows[0]!.increaseQuantity);
    expect(item.update).not.toHaveBeenCalled();
    expect(flow.publish).not.toHaveBeenCalled();
  });

  it("deletes the selected Item after confirmation outside Edit Mode", async () => {
    const { actor, rows, attach } = setup();
    attach();
    await inventoryMenu().entries[1]!.onClick(pointer(rows[0]!.main), rows[0]!.main);
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["equipment-1"]);
  });

  it("keeps queued updates and publication blocked when permission is lost before execution", async () => {
    const item = equipment();
    const { sheet, container, rows } = setup([item]);
    const changes = [
      click(sheet, container, rows[0]!.increaseQuantity),
      click(sheet, container, rows[0]!.increaseUses),
      click(sheet, container, rows[0]!.main),
    ];
    sheet.isEditable = false;
    await Promise.all(changes);
    expect(item.update).not.toHaveBeenCalled();
    expect(flow.publish).not.toHaveBeenCalled();
  });

  it("recovers from an update failure and preserves expansion while replacing the render", async () => {
    const item = equipment();
    const { sheet } = setup([item]);
    const view = renderCycle(sheet);
    await sheet.render();
    await click(sheet, view.container, view.rows[0]!.chevron);
    item.update.mockRejectedValueOnce(new Error("Persistence failed"));
    await click(sheet, view.container, view.rows[0]!.increaseQuantity);
    expect(view.context!.agent.equipment[0]?.isExpanded).toBe(true);
    await click(sheet, view.container, view.rows[0]!.increaseQuantity);
    expect(item.system.quantity).toBe(3);
    expect(view.context!.agent.equipment[0]?.isExpanded).toBe(true);
    expect(flow.publish).not.toHaveBeenCalled();
  });
});
