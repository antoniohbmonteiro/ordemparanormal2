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
  target: TestElement;
  button: number;
  stopped: boolean;
  stopPropagation: ReturnType<typeof vi.fn>;
  preventDefault: ReturnType<typeof vi.fn>;
}
type Action = (this: TestSheet, event: TestEvent, target: TestElement) => Promise<void>;
type Listener = (event: TestEvent) => void;

// Only the sheet's scoped selectors and capture/bubble boundary are modeled here.
class TestElement {
  readonly listeners: Array<{ type: string; listener: Listener; capture: boolean; signal?: AbortSignal }> = [];
  dataset: Record<string, string> = {};
  constructor(readonly classes = "", readonly parent: TestElement | null = null, readonly tag = "div") {}
  closest(selector: string): TestElement | null {
    const matches = selector.split(",").some((part) => {
      const trimmed = part.trim();
      if (trimmed === "button:not(.op2-ability-card__use)") return this.tag === "button" && !this.classes.split(" ").includes("op2-ability-card__use");
      return this.classes.split(" ").includes(trimmed.slice(1));
    });
    return matches ? this : this.parent?.closest(selector) ?? null;
  }
  querySelector(): null { return null; }
  addEventListener(type: string, listener: Listener, options: { capture?: boolean; signal?: AbortSignal } = {}): void {
    this.listeners.push({ type, listener, capture: options.capture ?? false, signal: options.signal });
  }
  emit(type: string, target: TestElement, button = 0): TestEvent {
    const event = pointer(target, button);
    for (const entry of [...this.listeners].sort((a, b) => Number(b.capture) - Number(a.capture))) {
      if (entry.type !== type || entry.signal?.aborted) continue;
      entry.listener(event);
      if (event.stopped) break;
    }
    return event;
  }
}
function pointer(target: TestElement, button = 0): TestEvent {
  const event: TestEvent = { target, button, stopped: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  event.stopPropagation.mockImplementation(() => { event.stopped = true; });
  return event;
}
interface MenuEntry {
  label: string;
  onClick(event: TestEvent, target: TestElement): unknown;
}
interface TestMenu {
  entries: MenuEntry[];
  render: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  selector: string;
}
const menus: TestMenu[] = [];
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
  render: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
  close(): Promise<void>;
  _prepareContext(options: object): Promise<{ agent: AgentSheetViewModel; canEditStructure: boolean }>;
  _attachPartListeners(partId: string, element: TestElement, options: object): void;
}
let Sheet: { new(options: { document: object }): TestSheet; DEFAULT_OPTIONS: { actions: Record<string, Action> } };

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
    async _prepareContext(): Promise<object> { return { editable: this.isEditable }; }
    _attachPartListeners(): void {}
    _createContextMenu(provider: () => MenuEntry[], selector: string, options: { container: TestElement; eventName: string }): TestMenu {
      const menu = { entries: provider(), selector, render: vi.fn(async (_target?: TestElement, _options?: unknown) => undefined), close: vi.fn(async () => undefined) };
      menus.push(menu);
      options.container.addEventListener(options.eventName, (event) => {
        const target = event.target.closest(selector);
        if (target) void menu.render(target);
      });
      return menu;
    }
    async _preClose(): Promise<void> {}
    _onClose(): void {}
    async close(): Promise<void> { await this._preClose(); this._onClose(); }
  }
  vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("foundry", { applications: {
    api: { DialogV2: { confirm: flow.confirm }, HandlebarsApplicationMixin: <T>(base: T) => base },
    sheets: { ActorSheetV2: MockActorSheetV2 },
    ux: { TextEditor: { implementation: { enrichHTML: vi.fn(async (html: string) => html) } } },
  } });
  vi.stubGlobal("document", { createElement: () => {
    const element = { innerHTML: "", textContent: "", get outerHTML() { return `<p>${element.textContent}</p>`; }, get content() { return { textContent: element.innerHTML.replace(/<[^>]*>/g, ""), querySelector: () => null }; } };
    return element;
  } });
  vi.stubGlobal("game", { user: { isGM: true }, i18n: { localize: (key: string) => key, format: (key: string) => key } });
  vi.stubGlobal("ui", { notifications: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } });
  const module = await import("./agent-sheet");
  Sheet = module.AgentSheet as unknown as typeof Sheet;
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
  trigger.dataset.itemId = ability.id;
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
    const { sheet, attach, container, main, row, trigger, click } = setup();
    sheet.editMode = true;
    attach();
    const abilityMenus = menus.filter(({ selector }) => selector.includes("ability"));
    expect(abilityMenus).toHaveLength(1);
    const menu = abilityMenus[0]!;
    const entries = menu.entries;
    expect(entries.map(({ label }) => label)).toEqual(["ORDEMPARANORMAL2.AgentSheet.Abilities.Edit", "ORDEMPARANORMAL2.AgentSheet.Abilities.Delete"]);
    const event = container.emit("contextmenu", main, 2);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(menu.render).toHaveBeenCalledWith(row, { event });
    await click(trigger);
    expect(menu.render).toHaveBeenCalledTimes(2);
    expect(menu.entries).toBe(entries);
    expect(menu.render.mock.calls[1]?.[0]).toBe(row);
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
    expect(menu.render).not.toHaveBeenCalled();
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

  it("suppresses right-click on every internal control without opening or using anything", () => {
    const fixture = setup();
    fixture.attach();
    for (const target of [fixture.resource, fixture.decrease, fixture.increase, fixture.chevron, fixture.trigger, fixture.details, fixture.link]) {
      const event = fixture.container.emit("contextmenu", target, 2);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
    }
    expect(menus[0]!.render).not.toHaveBeenCalled();
    expect(flow.useAbility).not.toHaveBeenCalled();
    expect(flow.adjust).not.toHaveBeenCalled();
  });

  it("closes the old menu and aborts its listeners on replacement and close", async () => {
    const { sheet, attach, container, main, trigger, click } = setup();
    attach();
    const old = menus[0]!;
    await sheet._prepareContext({});
    expect(old.close).toHaveBeenCalledOnce();
    attach();
    const current = menus[1]!;
    container.emit("contextmenu", main, 2);
    expect(old.render).not.toHaveBeenCalled();
    expect(current.render).toHaveBeenCalledOnce();
    await sheet.close();
    expect(current.close).toHaveBeenCalledOnce();
    container.emit("contextmenu", main, 2);
    expect(current.render).toHaveBeenCalledOnce();
    await click(trigger);
    expect(current.render).toHaveBeenCalledOnce();
    expect(old.render).not.toHaveBeenCalled();
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
