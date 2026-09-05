import type {
  DocumentSheetRenderContext,
  DocumentSheetRenderOptions,
} from "@client/applications/api/document-sheet.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import {
  ABILITY_COST_SOURCES,
  normalizeAbilityCost,
  type AbilityCostSource,
} from "../../core/abilities/ability-cost";
import {
  EMPTY_ABILITY_RESOURCE,
  prepareAbilityResourceRemoval,
  readAbilityResource,
  type AbilityResourceData,
} from "../../core/abilities/ability-resource";

const ABILITY_SHEET_TEMPLATE =
  "systems/ordemparanormal2/templates/item/ability-item-sheet.hbs";

interface AbilityItemSheetContext
  extends DocumentSheetRenderContext<foundry.documents.Item> {
  ability: {
    readonly name: string;
    readonly img: string;
    readonly uuid: string;
    readonly description: string;
    readonly enrichedDescription: string;
    readonly cost: {
      readonly source: AbilityCostSource;
      readonly amount: number;
      readonly sources: readonly {
        readonly value: AbilityCostSource;
        readonly labelKey: string;
        readonly selected: boolean;
      }[];
    };
    readonly resource: AbilityResourceData | null;
  };
}

function readAbilitySystem(item: foundry.documents.Item) {
  const system = item.system as unknown as {
    readonly description?: unknown;
    readonly cost?: {
      readonly source?: unknown;
      readonly amount?: unknown;
    };
    readonly resource?: unknown;
  };
  const source = ABILITY_COST_SOURCES.includes(
    system.cost?.source as AbilityCostSource,
  )
    ? (system.cost?.source as AbilityCostSource)
    : "none";
  const amount =
    Number.isInteger(system.cost?.amount) && Number(system.cost?.amount) >= 0
      ? Number(system.cost?.amount)
      : 0;

  return {
    description:
      typeof system.description === "string" ? system.description : "",
    cost: { source, amount },
    resource: readAbilityResource(system.resource),
  };
}

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor } = foundry.applications.ux;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithItemSheetV2;

export class AbilityItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      addResource: AbilityItemSheet.#onAddResource,
      removeResource: AbilityItemSheet.#onRemoveResource,
    },
    classes: ["ordemparanormal2", "ability-item-sheet"],
    form: { closeOnSubmit: false, submitOnChange: true },
    position: { width: 560, height: 650 },
    window: {
      contentClasses: ["op2-ability-item-sheet-content"],
      resizable: true,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: {
      template: ABILITY_SHEET_TEMPLATE,
      scrollable: [".op2-ability-sheet__body"],
    },
  };

  #updateQueue: Promise<void> = Promise.resolve();

  #enqueueUpdate(operation: () => Promise<void>): void {
    this.#updateQueue = this.#updateQueue
      .then(operation)
      .catch(async (error: unknown) => {
        console.error("ordemparanormal2 | Failed to update Ability", error);
        ui.notifications.error(
          game.i18n.localize("ORDEMPARANORMAL2.AbilitySheet.Errors.UpdateFailed"),
        );
        await this.render({ force: true });
      });
  }

  protected override async _prepareContext(
    options: DocumentSheetRenderOptions & HandlebarsRenderOptions,
  ): Promise<AbilityItemSheetContext> {
    const context = (await super._prepareContext(
      options,
    )) as DocumentSheetRenderContext<foundry.documents.Item>;
    const item = this.document as foundry.documents.Item;
    const system = readAbilitySystem(item);
    const enrichedDescription = await TextEditor.implementation.enrichHTML(
      system.description,
      {
        relativeTo: item,
        secrets: item.isOwner,
      },
    );

    return {
      ...context,
      ability: {
        name: item.name,
        img: item.img ?? "icons/svg/item-bag.svg",
        uuid: item.uuid,
        description: system.description,
        enrichedDescription,
        cost: {
          ...system.cost,
          sources: ABILITY_COST_SOURCES.map((source) => ({
            value: source,
            labelKey: `ORDEMPARANORMAL2.AbilitySheet.CostSources.${source}`,
            selected: source === system.cost.source,
          })),
        },
        resource: system.resource,
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

    for (const input of htmlElement.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("[data-cost-edit]")) {
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        if (!this.isEditable) return;
        const shouldRender = input.dataset.costField === "source";
        this.#enqueueUpdate(async () => {
          await this.#updateCost(htmlElement);
          if (shouldRender) await this.render({ force: true });
        });
      });
    }

    for (const input of htmlElement.querySelectorAll<HTMLInputElement>(
      "[data-resource-edit]",
    )) {
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        if (!this.isEditable) return;
        this.#enqueueUpdate(() => this.#updateResource(input));
      });
    }
  }

  async #updateCost(root: HTMLElement): Promise<void> {
    const source = root.querySelector<HTMLSelectElement>(
      '[data-cost-field="source"]',
    )?.value as AbilityCostSource | undefined;
    const amount = root.querySelector<HTMLInputElement>(
      '[data-cost-field="amount"]',
    )?.valueAsNumber;
    if (!source || !ABILITY_COST_SOURCES.includes(source)) return;

    await (this.document as foundry.documents.Item).update({
      "system.cost": normalizeAbilityCost(source, amount ?? 0),
    });
  }

  async #updateResource(input: HTMLInputElement): Promise<void> {
    const field = input.dataset.resourceField;
    if (field !== "value" && field !== "max") return;
    if (!Number.isInteger(input.valueAsNumber) || input.valueAsNumber < 0) {
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AbilitySheet.Errors.InvalidResource",
        ),
      );
      await this.render({ force: true });
      return;
    }

    const item = this.document as foundry.documents.Item;
    const resource = readAbilitySystem(item).resource;
    if (!resource) return;
    await item.update({
      "system.resource": { ...resource, [field]: input.valueAsNumber },
    });
  }

  static async #onAddResource(this: AbilityItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#updateQueue;
    await this.submit();
    const item = this.document as foundry.documents.Item;
    if (readAbilitySystem(item).resource) return;
    await item.update({ "system.resource": { ...EMPTY_ABILITY_RESOURCE } });
  }

  static async #onRemoveResource(this: AbilityItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#updateQueue;
    await this.submit();

    const item = this.document as foundry.documents.Item;
    const system = readAbilitySystem(item);
    if (!system.resource) return;

    const removal = prepareAbilityResourceRemoval(system.cost, system.resource);
    const referenced = system.cost.source === "resource";
    if (removal.confirmationRequired) {
      const confirmed = await DialogV2.confirm({
        classes: ["ordemparanormal2"],
        content: `<p>${game.i18n.localize(
          referenced
            ? "ORDEMPARANORMAL2.AbilitySheet.ConfirmRemoveCostResource"
            : "ORDEMPARANORMAL2.AbilitySheet.ConfirmRemoveResource",
        )}</p>`,
        modal: true,
        rejectClose: false,
        window: {
          title: game.i18n.localize(
            "ORDEMPARANORMAL2.AbilitySheet.RemoveResourceTitle",
          ),
        },
      });
      if (!confirmed) return;
    }

    await item.update({
      "system.resource": null,
      ...(referenced
        ? { "system.cost": removal.cost }
        : {}),
    });
  }
}
