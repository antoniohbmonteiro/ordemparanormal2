import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EquipmentUseData } from "../../core/equipment/equipment-use";

const use: EquipmentUseData = { id: "measure", name: "Medir", description: "<p>Descrição</p>", consumesUse: false, mechanic: "standard" };
const confirmRemove = vi.fn();
const notifyError = vi.fn();
const randomID = vi.fn();
const enrichHTML = vi.fn(async (text: string) => `<div>${text}</div>`);

class Control extends EventTarget {
  value = "";
  checked = false;
  get valueAsNumber() { return this.value.trim() ? Number(this.value) : NaN; }
  dataset: Record<string, string>;
  constructor(id: string, field: string) {
    super();
    this.dataset = { useFormId: id, useFormEdit: field };
  }
  change(value: string | boolean) {
    if (typeof value === "boolean") this.checked = value;
    else this.value = value;
    this.dispatchEvent(new Event("change"));
  }
}

interface TestItem {
  system: { uses: { value: number; max: number } | null; useForms: unknown; quantity: number | null };
  update: ReturnType<typeof vi.fn>;
}
interface TestSheet {
  document: TestItem;
  isEditable: boolean;
  submit: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  _prepareContext(options: object): Promise<{ editable: boolean; equipment: {
    useForms: (EquipmentUseData & { enrichedDescription: string })[];
    quantity: { value: number; limit: number } | null;
  } }>;
  _attachPartListeners(part: string, element: object, options: object): void;
}
type Action = (this: TestSheet, event?: object, target?: object) => Promise<void>;
let Sheet: { new (item: TestItem): TestSheet; DEFAULT_OPTIONS: { actions: Record<string, Action> } };
let template: Handlebars.TemplateDelegate;

function item(forms: unknown = [structuredClone(use)]): TestItem {
  const result = {
    name: "Ferramenta", uuid: "Item.tool", img: "icons/svg/item-bag.svg", isOwner: true,
    system: { category: "tool", description: "", uses: { value: 3, max: 3 }, useForms: forms, quantity: null as number | null },
    update: vi.fn(async (change: Record<string, unknown>) => {
      if (Object.hasOwn(change, "system.useForms")) result.system.useForms = structuredClone(change["system.useForms"]);
      if (Object.hasOwn(change, "system.quantity")) result.system.quantity = change["system.quantity"] as number | null;
    }),
  };
  return result;
}

function attach(sheet: TestSheet, ...controls: Control[]) {
  sheet._attachPartListeners("main", {
    querySelectorAll: (selector: string) => selector === "[data-use-form-edit]"
      ? controls.filter(control => control.dataset.useFormEdit !== undefined)
      : selector === "[data-quantity-edit]" ? controls.filter(control => control.dataset.quantityEdit !== undefined) : [],
  }, {});
}

beforeAll(async () => {
  class BaseSheet {
    isEditable = true;
    submit = vi.fn(async () => undefined);
    render = vi.fn(async () => this);
    constructor(readonly document: TestItem) {}
    async _prepareContext() { return { editable: this.isEditable }; }
    _attachPartListeners() {}
  }
  vi.stubGlobal("HTMLInputElement", Control);
  vi.stubGlobal("foundry", {
    utils: { randomID },
    applications: {
      sheets: { ItemSheetV2: BaseSheet },
      api: { DialogV2: { confirm: confirmRemove }, HandlebarsApplicationMixin: <T>(base: T) => base },
      ux: { TextEditor: { implementation: { enrichHTML } } },
    },
  });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key.endsWith("NewUseForm") ? "Nova forma de uso" : key } });
  vi.stubGlobal("ui", { notifications: { error: notifyError } });
  Sheet = (await import("./equipment-item-sheet")).EquipmentItemSheet as unknown as typeof Sheet;
  const source = await readFile(fileURLToPath(new URL("../../../templates/item/equipment-item-sheet.hbs", import.meta.url)), "utf8");
  Handlebars.registerHelper("localize", (key: string) => key);
  template = Handlebars.compile(source);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  confirmRemove.mockReset().mockResolvedValue(true);
  notifyError.mockClear();
  enrichHTML.mockClear();
  randomID.mockReset().mockReturnValue("new-use");
});

describe("Equipment Item Sheet use forms", () => {
  it("edits the mechanic with existing permission and preserves the rest of the form", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    const mechanic = new Control("measure", "mechanic");
    attach(sheet, mechanic);
    mechanic.change("laboratory");
    await vi.waitFor(() => expect(equipment.update).toHaveBeenCalledOnce());
    expect(equipment.system.useForms).toEqual([{ ...use, mechanic: "laboratory" }]);
    expect(equipment.system.uses).toEqual({ value: 3, max: 3 });
    sheet.isEditable = false;
    mechanic.change("standard");
    expect(equipment.update).toHaveBeenCalledOnce();
  });
  it("adds a default form without touching the counter or replacing existing forms", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    await Sheet.DEFAULT_OPTIONS.actions.addUseForm.call(sheet);
    expect(equipment.system.useForms).toEqual([use, {
      id: "new-use", name: "Nova forma de uso", description: "", consumesUse: false, mechanic: "standard",
    }]);
    expect(equipment.update).toHaveBeenCalledWith({ "system.useForms": equipment.system.useForms });
    expect(equipment.system.uses).toEqual({ value: 3, max: 3 });
  });

  it("captures edits before rerenders and serializes consecutive changes against current state", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    const name = new Control("measure", "name");
    const description = new Control("measure", "description");
    const consumes = new Control("measure", "consumesUse");
    attach(sheet, name, description, consumes);
    name.change(" Novo nome ");
    description.change("Novo texto");
    consumes.change(true);
    name.value = "Valor alterado após o evento";
    description.dataset.useFormId = "detached";
    consumes.checked = false;
    await vi.waitFor(() => expect(equipment.update).toHaveBeenCalledTimes(3));
    expect(equipment.system.useForms).toEqual([{ ...use, name: "Novo nome", description: "Novo texto", consumesUse: true }]);
    expect(equipment.system.uses).toEqual({ value: 3, max: 3 });
  });

  it("keeps another form and removes only the captured id after confirmation", async () => {
    const other = { ...use, id: "other" };
    const equipment = item([use, other]);
    const sheet = new Sheet(equipment);
    const target = { dataset: { useFormId: "measure" } };
    confirmRemove.mockImplementationOnce(async () => { target.dataset.useFormId = "other"; return true; });
    await Sheet.DEFAULT_OPTIONS.actions.removeUseForm.call(sheet, {}, target);
    expect(equipment.system.useForms).toEqual([other]);
    expect(equipment.system.uses).toEqual({ value: 3, max: 3 });
  });

  it("does not remove a form when confirmation is cancelled", async () => {
    confirmRemove.mockResolvedValueOnce(false);
    const equipment = item();
    await Sheet.DEFAULT_OPTIONS.actions.removeUseForm.call(new Sheet(equipment), {}, { dataset: { useFormId: "measure" } });
    expect(equipment.update).not.toHaveBeenCalled();
  });

  it("blocks controls and actions without edit permission", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    sheet.isEditable = false;
    const name = new Control("measure", "name");
    attach(sheet, name);
    name.change("Outra");
    await Sheet.DEFAULT_OPTIONS.actions.addUseForm.call(sheet);
    await Sheet.DEFAULT_OPTIONS.actions.removeUseForm.call(sheet, {}, { dataset: { useFormId: "measure" } });
    expect(equipment.update).not.toHaveBeenCalled();
    expect(confirmRemove).not.toHaveBeenCalled();
  });

  it("rechecks permission inside queued changes and after confirmation", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    const name = new Control("measure", "name");
    attach(sheet, name);
    name.change("Outra");
    sheet.isEditable = false;
    await Sheet.DEFAULT_OPTIONS.actions.addUseForm.call(sheet);
    expect(equipment.update).not.toHaveBeenCalled();
    sheet.isEditable = true;
    confirmRemove.mockImplementationOnce(async () => { sheet.isEditable = false; return true; });
    await Sheet.DEFAULT_OPTIONS.actions.removeUseForm.call(sheet, {}, { dataset: { useFormId: "measure" } });
    expect(equipment.update).not.toHaveBeenCalled();
  });

  it("reports invalid or stale edits and refuses to overwrite invalid collections", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    const name = new Control("measure", "name");
    attach(sheet, name);
    name.change(" ");
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    name.dataset.useFormId = "missing";
    name.change("Outra");
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledTimes(2));
    equipment.system.useForms = [use, use];
    await Sheet.DEFAULT_OPTIONS.actions.addUseForm.call(sheet);
    expect(notifyError).toHaveBeenCalledTimes(3);
    expect(equipment.update).not.toHaveBeenCalled();
    expect(sheet.render).toHaveBeenCalledTimes(3);
  });

  it("recovers after an update fails and rejects generated id collisions", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    equipment.update.mockRejectedValueOnce(new Error("Update failed"));
    await Sheet.DEFAULT_OPTIONS.actions.addUseForm.call(sheet);
    expect(notifyError).toHaveBeenCalledTimes(1);
    await Sheet.DEFAULT_OPTIONS.actions.addUseForm.call(sheet);
    expect(equipment.system.useForms).toHaveLength(2);
    await Sheet.DEFAULT_OPTIONS.actions.addUseForm.call(sheet);
    expect(notifyError).toHaveBeenCalledTimes(2);
    expect(equipment.system.useForms).toHaveLength(2);
  });

  it("renders editable fields, escaped drafts and enriched observer descriptions", async () => {
    const sheet = new Sheet(item([{ ...use, description: "<p>Texto</p>" }]));
    const editable = await sheet._prepareContext({});
    const html = template(editable);
    expect(html).toContain('data-action="addUseForm"');
    expect(html).toContain('data-action="removeUseForm"');
    expect(html).toContain('data-use-form-edit="consumesUse"');
    expect(html).toContain('data-use-form-edit="mechanic"');
    expect(html).toContain("&lt;p&gt;Texto&lt;/p&gt;");
    sheet.isEditable = false;
    const observer = await sheet._prepareContext({});
    const readonly = template(observer);
    expect(readonly).not.toContain('data-action="addUseForm"');
    expect(readonly).not.toContain('data-action="removeUseForm"');
    expect(readonly).not.toContain('<textarea');
    expect(readonly).toContain("<div><p>Texto</p></div>");
    expect(readonly).toContain('data-use-form-edit="name"');
    expect(readonly).toContain('disabled');
    expect(enrichHTML).toHaveBeenCalledWith("<p>Texto</p>", { relativeTo: sheet.document, secrets: true });
  });
  it("keeps the stored mechanic selector visible in every Equipment category", async () => {
    const equipment = item([{ ...use, mechanic: "laboratory" }]);
    const sheet = new Sheet(equipment);
    for (const category of ["tool", "general", "weapon"]) {
      (equipment.system as typeof equipment.system & { category: string }).category = category;
      const html = template(await sheet._prepareContext({}));
      expect(html).toContain('data-use-form-edit="mechanic"');
      expect(html).toContain('value="laboratory" selected');
    }
  });
});

describe("Equipment Item Sheet optional quantity", () => {
  it("opts into a single quantity without changing uses or forms, and renders zero as controlled", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    await Sheet.DEFAULT_OPTIONS.actions.addQuantity.call(sheet);
    await Sheet.DEFAULT_OPTIONS.actions.addQuantity.call(sheet);
    expect(equipment.update.mock.calls).toEqual([[{ "system.quantity": 1 }]]);
    expect(equipment.system.uses).toEqual({ value: 3, max: 3 });
    expect(equipment.system.useForms).toEqual([use]);
    equipment.system.quantity = 0;
    const context = await sheet._prepareContext({});
    expect(context.equipment.quantity).toEqual({ value: 0, limit: Number.MAX_SAFE_INTEGER });
    const output = template(context);
    expect(output).toContain('value="0" min="0"');
    expect(output).toContain('data-action="removeQuantity"');
    expect(output).not.toContain('data-action="addQuantity"');
  });

  it("captures numeric changes before rerenders and serializes them", async () => {
    const equipment = item();
    equipment.system.quantity = 1;
    const sheet = new Sheet(equipment);
    const control = new Control("", "");
    control.dataset = { quantityEdit: "" };
    attach(sheet, control);
    control.change("2");
    control.change("0");
    control.value = "100";
    await vi.waitFor(() => expect(equipment.update).toHaveBeenCalledTimes(2));
    expect(equipment.update.mock.calls).toEqual([[{ "system.quantity": 2 }], [{ "system.quantity": 0 }]]);
    expect(equipment.system.quantity).toBe(0);
  });

  it.each(["-1", "0.5", "Infinity", "9007199254740992", ""])("rejects invalid quantity %s without writing", async value => {
    const equipment = item();
    equipment.system.quantity = 1;
    const sheet = new Sheet(equipment);
    const control = new Control("", "");
    control.dataset = { quantityEdit: "" };
    attach(sheet, control);
    control.change(value);
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(equipment.update).not.toHaveBeenCalled();
    expect(equipment.system.quantity).toBe(1);
  });

  it("confirms removal of a positive quantity, preserves it on cancel and removes zero without a dialog", async () => {
    const equipment = item();
    equipment.system.quantity = 2;
    const sheet = new Sheet(equipment);
    confirmRemove.mockResolvedValueOnce(false);
    await Sheet.DEFAULT_OPTIONS.actions.removeQuantity.call(sheet);
    expect(equipment.system.quantity).toBe(2);
    await Sheet.DEFAULT_OPTIONS.actions.removeQuantity.call(sheet);
    expect(equipment.system.quantity).toBeNull();
    equipment.system.quantity = 0;
    confirmRemove.mockClear();
    await Sheet.DEFAULT_OPTIONS.actions.removeQuantity.call(sheet);
    expect(confirmRemove).not.toHaveBeenCalled();
    expect(equipment.system.quantity).toBeNull();
    expect(equipment.system.uses).toEqual({ value: 3, max: 3 });
    expect(equipment.system.useForms).toEqual([use]);
  });

  it("blocks configuration without permission and rechecks queued edits and confirmation", async () => {
    const equipment = item();
    const sheet = new Sheet(equipment);
    sheet.isEditable = false;
    await Sheet.DEFAULT_OPTIONS.actions.addQuantity.call(sheet);
    await Sheet.DEFAULT_OPTIONS.actions.removeQuantity.call(sheet);
    expect(equipment.update).not.toHaveBeenCalled();
    equipment.system.quantity = 1;
    sheet.isEditable = true;
    const control = new Control("", "");
    control.dataset = { quantityEdit: "" };
    attach(sheet, control);
    control.change("2");
    sheet.isEditable = false;
    await vi.waitFor(() => expect(sheet.render).not.toHaveBeenCalled());
    await Sheet.DEFAULT_OPTIONS.actions.addQuantity.call(sheet);
    expect(equipment.update).not.toHaveBeenCalled();
    sheet.isEditable = true;
    confirmRemove.mockImplementationOnce(async () => { sheet.isEditable = false; return true; });
    await Sheet.DEFAULT_OPTIONS.actions.removeQuantity.call(sheet);
    expect(equipment.update).not.toHaveBeenCalled();
    const output = template(await sheet._prepareContext({}));
    expect(output).not.toContain('data-action="removeQuantity"');
    expect(output).toMatch(/data-quantity-edit disabled/);
  });
});
