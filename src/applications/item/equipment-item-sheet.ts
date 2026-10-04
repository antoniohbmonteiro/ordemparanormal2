import type {
  DocumentSheetRenderContext,
  DocumentSheetRenderOptions,
} from "@client/applications/api/document-sheet.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import {
  EQUIPMENT_CATEGORIES,
  isEquipmentCategory,
  type EquipmentCategory,
} from "../../core/equipment/equipment-category";
import {
  EMPTY_EQUIPMENT_USES,
  readEquipmentUses,
  type EquipmentUsesData,
} from "../../core/equipment/equipment-uses";
import {
  appendEquipmentUse,
  patchEquipmentUse,
  readEquipmentUseForms,
  removeEquipmentUse,
  type EquipmentUseData,
  type EquipmentUsePatch,
} from "../../core/equipment/equipment-use";
import { isEquipmentQuantity, readEquipmentQuantity } from "../../core/equipment/equipment-quantity";
import { mutateOwnedEquipmentUses, type EquipmentUsesMutation } from "../../adapters/foundry/equipment/mutate-owned-equipment-uses";

const EQUIPMENT_SHEET_TEMPLATE =
  "systems/ordemparanormal2/templates/item/equipment-item-sheet.hbs";

interface EquipmentItemSheetContext
  extends DocumentSheetRenderContext<foundry.documents.Item> {
  equipment: {
    readonly name: string;
    readonly img: string;
    readonly uuid: string;
    readonly description: string;
    readonly enrichedDescription: string;
    readonly category: {
      readonly value: EquipmentCategory;
      readonly options: readonly {
        readonly value: EquipmentCategory;
        readonly labelKey: string;
        readonly selected: boolean;
      }[];
    };
    readonly uses: EquipmentUsesData | null;
    readonly quantity: { readonly value: number; readonly limit: number } | null;
    readonly useForms: readonly (EquipmentUseData & { readonly enrichedDescription: string; readonly isLaboratory: boolean })[];
  };
}

function readEquipmentSystem(item: foundry.documents.Item) {
  const system = item.system as unknown as {
    readonly category?: unknown;
    readonly description?: unknown;
    readonly uses?: unknown;
    readonly quantity?: unknown;
    readonly useForms?: unknown;
  };
  const category = isEquipmentCategory(system.category)
    ? system.category
    : "general";

  return {
    category,
    description:
      typeof system.description === "string" ? system.description : "",
    uses: readEquipmentUses(system.uses),
    quantity: readEquipmentQuantity(system.quantity),
    useForms: readEquipmentUseForms(system.useForms === undefined ? [] : system.useForms),
  };
}

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor } = foundry.applications.ux;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithItemSheetV2;

export class EquipmentItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      addQuantity: EquipmentItemSheet.#onAddQuantity,
      removeQuantity: EquipmentItemSheet.#onRemoveQuantity,
      addUses: EquipmentItemSheet.#onAddUses,
      removeUses: EquipmentItemSheet.#onRemoveUses,
      addUseForm: EquipmentItemSheet.#onAddUseForm,
      removeUseForm: EquipmentItemSheet.#onRemoveUseForm,
    },
    classes: ["ordemparanormal2", "equipment-item-sheet"],
    form: { closeOnSubmit: false, submitOnChange: true },
    position: { width: 560, height: 650 },
    window: {
      contentClasses: ["op2-equipment-item-sheet-content"],
      resizable: true,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: {
      template: EQUIPMENT_SHEET_TEMPLATE,
      scrollable: [".op2-equipment-sheet__body"],
    },
  };

  #updateQueue: Promise<void> = Promise.resolve();

  #enqueueUpdate(operation: () => Promise<void>): Promise<void> {
    this.#updateQueue = this.#updateQueue
      .then(operation)
      .catch(async (error: unknown) => {
        console.error("ordemparanormal2 | Failed to update Equipment", error);
        ui.notifications.error(
          game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.Errors.UpdateFailed"),
        );
        await this.render({ force: true });
      });
    return this.#updateQueue;
  }

  #enqueueUseFormsChange(
    mutate: (uses: readonly EquipmentUseData[]) => readonly EquipmentUseData[] | null,
  ): Promise<void> {
    return this.#enqueueUpdate(async () => {
      if (!this.isEditable) return;
      const item = this.document as foundry.documents.Item;
      const current = readEquipmentSystem(item).useForms;
      if (!current) throw new Error("Invalid Equipment use forms.");
      const next = mutate(current);
      if (!next) throw new Error("Invalid or stale Equipment use form change.");
      await item.update({ "system.useForms": next });
    });
  }

  protected override async _prepareContext(
    options: DocumentSheetRenderOptions & HandlebarsRenderOptions,
  ): Promise<EquipmentItemSheetContext> {
    const context = (await super._prepareContext(
      options,
    )) as DocumentSheetRenderContext<foundry.documents.Item>;
    const item = this.document as foundry.documents.Item;
    const system = readEquipmentSystem(item);
    const enrichedDescription = await TextEditor.implementation.enrichHTML(
      system.description,
      {
        relativeTo: item,
        secrets: item.isOwner,
      },
    );

    return {
      ...context,
      equipment: {
        name: item.name,
        img: item.img ?? "icons/svg/item-bag.svg",
        uuid: item.uuid,
        description: system.description,
        enrichedDescription,
        category: {
          value: system.category,
          options: EQUIPMENT_CATEGORIES.map((category) => ({
            value: category,
            labelKey: `ORDEMPARANORMAL2.Equipment.Categories.${category}`,
            selected: category === system.category,
          })),
        },
        uses: system.uses,
        quantity: system.quantity === null ? null : { value: system.quantity, limit: Number.MAX_SAFE_INTEGER },
        useForms: await Promise.all((system.useForms ?? []).map(async use => ({
          ...use,
          isLaboratory: use.mechanic === "laboratory",
          enrichedDescription: await TextEditor.implementation.enrichHTML(use.description, {
            relativeTo: item, secrets: item.isOwner,
          }),
        }))),
      },
    };
  }

  protected override _attachPartListeners(
    partId: string,
    htmlElement: HTMLElement,
    options: HandlebarsRenderOptions,
  ): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "main") return;

    for (const input of htmlElement.querySelectorAll<HTMLInputElement>("[data-quantity-edit]")) {
      input.addEventListener("change", event => {
        event.stopPropagation();
        if (!this.isEditable) return;
        const value = input.valueAsNumber;
        void this.#enqueueUpdate(async () => {
          if (!this.isEditable) return;
          if (!isEquipmentQuantity(value)) {
            ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.Errors.InvalidQuantity"));
            await this.render({ force: true });
            return;
          }
          const item = this.document as foundry.documents.Item;
          if (readEquipmentSystem(item).quantity === null) return;
          await item.update({ "system.quantity": value });
        });
      });
    }

    for (const input of htmlElement.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "[data-use-form-edit]",
    )) {
      input.addEventListener("change", event => {
        event.stopPropagation();
        if (!this.isEditable) return;
        const id = input.dataset.useFormId;
        const field = input.dataset.useFormEdit;
        if (!id) return;
        let patch: EquipmentUsePatch;
        if (field === "consumesUse" && input instanceof HTMLInputElement) {
          patch = { consumesUse: input.checked };
        } else if (field === "name" || field === "description") {
          patch = { [field]: input.value };
        } else if (field === "mechanic" && (input.value === "standard" || input.value === "laboratory")) {
          patch = { mechanic: input.value };
        } else return;
        void this.#enqueueUseFormsChange(uses => patchEquipmentUse(uses, id, patch));
      });
    }

    for (const input of htmlElement.querySelectorAll<HTMLSelectElement>(
      "[data-category-edit]",
    )) {
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        if (!this.isEditable) return;
        this.#enqueueUpdate(() => this.#updateCategory(input));
      });
    }

    for (const input of htmlElement.querySelectorAll<HTMLInputElement>(
      "[data-uses-edit]",
    )) {
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        if (!this.isEditable) return;
        const field = input.dataset.usesField;
        const value = input.valueAsNumber;
        this.#enqueueUpdate(() => this.#updateUses(field, value));
      });
    }
  }

  static async #onAddUseForm(this: EquipmentItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.submit();
    await this.#enqueueUseFormsChange(uses => appendEquipmentUse(uses, {
      id: foundry.utils.randomID(),
      name: game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.NewUseForm"),
      description: "",
      consumesUse: false,
      mechanic: "standard",
    }));
  }

  static async #onAddQuantity(this: EquipmentItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.submit();
    await this.#enqueueUpdate(async () => {
      if (!this.isEditable) return;
      const item = this.document as foundry.documents.Item;
      if (readEquipmentSystem(item).quantity !== null) return;
      await item.update({ "system.quantity": 1 });
    });
  }

  static async #onRemoveQuantity(this: EquipmentItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.submit();
    await this.#enqueueUpdate(async () => {
      if (!this.isEditable) return;
      const item = this.document as foundry.documents.Item;
      const quantity = readEquipmentSystem(item).quantity;
      if (quantity === null) return;
      if (quantity > 0) {
        const confirmed = await DialogV2.confirm({
          classes: ["ordemparanormal2"], modal: true, rejectClose: false,
          content: `<p>${game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.ConfirmRemoveQuantity")}</p>`,
          window: { title: game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.Actions.RemoveQuantity") },
        });
        if (confirmed !== true) return;
      }
      if (!this.isEditable) return;
      await item.update({ "system.quantity": null });
    });
  }

  static async #onRemoveUseForm(
    this: EquipmentItemSheet, _event: PointerEvent, target: HTMLElement,
  ): Promise<void> {
    if (!this.isEditable) return;
    const id = target.dataset.useFormId;
    if (!id) return;
    await this.submit();
    const confirmed = await DialogV2.confirm({
      classes: ["ordemparanormal2"],
      content: `<p>${game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.ConfirmRemoveUseForm")}</p>`,
      modal: true,
      rejectClose: false,
      window: { title: game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.Actions.RemoveUseForm") },
    });
    if (!confirmed) return;
    await this.#enqueueUseFormsChange(uses => removeEquipmentUse(uses, id));
  }

  async #updateCategory(input: HTMLSelectElement): Promise<void> {
    const category = input.value;
    if (!isEquipmentCategory(category)) return;

    await (this.document as foundry.documents.Item).update({
      "system.category": category,
    });
  }

  async #updateUses(field: string | undefined, value: number): Promise<void> {
    if (field !== "value" && field !== "max") return;
    if (!Number.isInteger(value) || value < 0) {
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.Errors.InvalidUses"),
      );
      await this.render({ force: true });
      return;
    }

    await this.#changeUses({ kind: "set", field, value });
  }

  async #changeUses(mutation: EquipmentUsesMutation): Promise<void> {
    if (!this.isEditable) return;
    const item = this.document as foundry.documents.Item;
    if (item.actor?.type === "agent" && item.id) {
      if (!await mutateOwnedEquipmentUses(item.actor, item.id, mutation)) throw new Error("Equipment counter change was rejected.");
      return;
    }
    const current = readEquipmentSystem(item).uses;
    if (mutation.kind === "set") {
      if (current) await item.update({ [`system.uses.${mutation.field}`]: mutation.value });
    } else if (mutation.kind === "add") {
      if (!current) await item.update({ "system.uses": { ...EMPTY_EQUIPMENT_USES } });
    } else if (current) await item.update({ "system.uses": null });
  }

  static async #onAddUses(this: EquipmentItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#updateQueue;
    await this.submit();
    const item = this.document as foundry.documents.Item;
    if (readEquipmentSystem(item).uses) return;
    await this.#enqueueUpdate(() => this.#changeUses({ kind: "add" }));
  }

  static async #onRemoveUses(this: EquipmentItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#updateQueue;
    await this.submit();

    const item = this.document as foundry.documents.Item;
    const uses = readEquipmentSystem(item).uses;
    if (!uses) return;

    if (uses.value > 0 || uses.max > 0) {
      const confirmed = await DialogV2.confirm({
        classes: ["ordemparanormal2"],
        content: `<p>${game.i18n.localize(
          "ORDEMPARANORMAL2.EquipmentSheet.ConfirmRemoveUses",
        )}</p>`,
        modal: true,
        rejectClose: false,
        window: {
          title: game.i18n.localize(
            "ORDEMPARANORMAL2.EquipmentSheet.RemoveUsesTitle",
          ),
        },
      });
      if (!confirmed) return;
    }

    await this.#enqueueUpdate(() => this.#changeUses({ kind: "remove" }));
  }
}
