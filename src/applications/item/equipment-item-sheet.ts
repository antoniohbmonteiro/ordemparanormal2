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
  };
}

function readEquipmentSystem(item: foundry.documents.Item) {
  const system = item.system as unknown as {
    readonly category?: unknown;
    readonly description?: unknown;
    readonly uses?: unknown;
  };
  const category = isEquipmentCategory(system.category)
    ? system.category
    : "general";

  return {
    category,
    description:
      typeof system.description === "string" ? system.description : "",
    uses: readEquipmentUses(system.uses),
  };
}

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor } = foundry.applications.ux;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithItemSheetV2;

export class EquipmentItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      addUses: EquipmentItemSheet.#onAddUses,
      removeUses: EquipmentItemSheet.#onRemoveUses,
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

  #enqueueUpdate(operation: () => Promise<void>): void {
    this.#updateQueue = this.#updateQueue
      .then(operation)
      .catch(async (error: unknown) => {
        console.error("ordemparanormal2 | Failed to update Equipment", error);
        ui.notifications.error(
          game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.Errors.UpdateFailed"),
        );
        await this.render({ force: true });
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
        this.#enqueueUpdate(() => this.#updateUses(input));
      });
    }
  }

  async #updateCategory(input: HTMLSelectElement): Promise<void> {
    const category = input.value;
    if (!isEquipmentCategory(category)) return;

    await (this.document as foundry.documents.Item).update({
      "system.category": category,
    });
  }

  async #updateUses(input: HTMLInputElement): Promise<void> {
    const field = input.dataset.usesField;
    if (field !== "value" && field !== "max") return;
    if (!Number.isInteger(input.valueAsNumber) || input.valueAsNumber < 0) {
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.EquipmentSheet.Errors.InvalidUses"),
      );
      await this.render({ force: true });
      return;
    }

    const item = this.document as foundry.documents.Item;
    const uses = readEquipmentSystem(item).uses;
    if (!uses) return;
    await item.update({
      "system.uses": { ...uses, [field]: input.valueAsNumber },
    });
  }

  static async #onAddUses(this: EquipmentItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#updateQueue;
    await this.submit();
    const item = this.document as foundry.documents.Item;
    if (readEquipmentSystem(item).uses) return;
    await item.update({ "system.uses": { ...EMPTY_EQUIPMENT_USES } });
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

    await item.update({ "system.uses": null });
  }
}
