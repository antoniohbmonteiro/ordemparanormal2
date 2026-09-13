import type { ApplicationClosingOptions } from "@client/applications/_types.mjs";
import type { DocumentSheetRenderContext, DocumentSheetRenderOptions } from "@client/applications/api/document-sheet.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

import { enqueueAbilityMutation } from "../../adapters/foundry/abilities/update-ability-uses";
import { readAbilityResource, EMPTY_ABILITY_RESOURCE, prepareAbilityResourceRemoval, type AbilityResourceData } from "../../core/abilities/ability-resource";
import { readAbilityUses, type AbilityUseData } from "../../core/abilities/ability-use";
import { localizeAbilityCost } from "../../ui/abilities/ability-cost-label";
import { AbilityUseEditor } from "./ability-use-editor";

const ABILITY_SHEET_TEMPLATE = "systems/ordemparanormal2/templates/item/ability-item-sheet.hbs";

interface AbilityItemSheetContext extends DocumentSheetRenderContext<foundry.documents.Item> {
  ability: {
    readonly name: string;
    readonly img: string;
    readonly uuid: string;
    readonly description: string;
    readonly enrichedDescription: string;
    readonly resource: AbilityResourceData | null;
    readonly uses: readonly (AbilityUseData & { readonly costLabel: string; readonly hasMinimumLevel: boolean })[] | null;
  };
}

function readAbilitySystem(item: foundry.documents.Item) {
  const system = item.system as unknown as { readonly description?: unknown; readonly resource?: unknown; readonly uses?: unknown };
  return {
    description: typeof system.description === "string" ? system.description : "",
    resource: readAbilityResource(system.resource),
    uses: readAbilityUses(system.uses),
  };
}

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor } = foundry.applications.ux;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as FoundryApplicationSheetsWithItemSheetV2;

export class AbilityItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      addResource: AbilityItemSheet.#onAddResource,
      createUse: AbilityItemSheet.#onCreateUse,
      openUse: AbilityItemSheet.#onOpenUse,
      removeResource: AbilityItemSheet.#onRemoveResource,
    },
    classes: ["ordemparanormal2", "ability-item-sheet"],
    form: { closeOnSubmit: false, submitOnChange: true },
    position: { width: 560, height: 650 },
    window: { contentClasses: ["op2-ability-item-sheet-content"], resizable: true },
  };

  static override TABS = {
    sheet: {
      tabs: [
        { id: "general", label: "ORDEMPARANORMAL2.AbilitySheet.Tabs.General" },
        { id: "uses", label: "ORDEMPARANORMAL2.AbilitySheet.Tabs.Uses" },
      ],
      initial: "general",
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: ABILITY_SHEET_TEMPLATE, scrollable: [".op2-ability-sheet__body"] },
  };

  #updateQueue: Promise<void> = Promise.resolve();
  readonly #useEditors = new Map<string, AbilityUseEditor>();

  #enqueueUpdate(operation: () => Promise<void>): void {
    this.#updateQueue = this.#updateQueue.then(operation).catch(async (error: unknown) => {
      console.error("ordemparanormal2 | Failed to update Ability", error);
      ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.AbilitySheet.Errors.UpdateFailed"));
      await this.render({ force: true });
    });
  }

  protected override async _prepareContext(options: DocumentSheetRenderOptions & HandlebarsRenderOptions): Promise<AbilityItemSheetContext> {
    const context = await super._prepareContext(options) as DocumentSheetRenderContext<foundry.documents.Item>;
    const item = this.document as foundry.documents.Item;
    const system = readAbilitySystem(item);
    const enrichedDescription = await TextEditor.implementation.enrichHTML(system.description, { relativeTo: item, secrets: item.isOwner });
    return {
      ...context,
      ability: {
        name: item.name,
        img: item.img ?? "icons/svg/item-bag.svg",
        uuid: item.uuid,
        description: system.description,
        enrichedDescription,
        resource: system.resource,
        uses: system.uses?.map((use) => ({ ...use, costLabel: localizeAbilityCost(use.cost), hasMinimumLevel: use.minimumLevel !== null })) ?? null,
      },
    };
  }

  protected override _attachPartListeners(partId: string, htmlElement: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "main") return;
    for (const input of htmlElement.querySelectorAll<HTMLInputElement>("[data-resource-edit]")) {
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        if (this.isEditable) this.#enqueueUpdate(() => this.#updateResource(input));
      });
    }
  }

  async #updateResource(input: HTMLInputElement): Promise<void> {
    const field = input.dataset.resourceField;
    if (field !== "value" && field !== "max") return;
    if (!Number.isInteger(input.valueAsNumber) || input.valueAsNumber < 0) {
      ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.AbilitySheet.Errors.InvalidResource"));
      await this.render({ force: true });
      return;
    }
    const item = this.document as foundry.documents.Item;
    const resource = readAbilitySystem(item).resource;
    if (resource) await item.update({ "system.resource": { ...resource, [field]: input.valueAsNumber } });
  }

  async #openUseEditor(key: string, use: AbilityUseData | null): Promise<void> {
    const existing = this.#useEditors.get(key);
    if (existing) { existing.bringToFront(); return; }
    const editor = new AbilityUseEditor(this.document as foundry.documents.Item, use, () => this.#useEditors.delete(key));
    this.#useEditors.set(key, editor);
    await editor.render({ force: true });
  }

  static async #onCreateUse(this: AbilityItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#updateQueue;
    await this.submit();
    await this.#openUseEditor(`new-${foundry.utils.randomID()}`, null);
  }

  static async #onOpenUse(this: AbilityItemSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.isEditable || !target.dataset.useId) return;
    await this.#updateQueue;
    await this.submit();
    const use = readAbilitySystem(this.document as foundry.documents.Item).uses?.find(({ id }) => id === target.dataset.useId) ?? null;
    if (use) await this.#openUseEditor(use.id, use);
  }

  static async #onAddResource(this: AbilityItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#updateQueue;
    await this.submit();
    const item = this.document as foundry.documents.Item;
    if (!readAbilitySystem(item).resource) await item.update({ "system.resource": { ...EMPTY_ABILITY_RESOURCE } });
  }

  static async #onRemoveResource(this: AbilityItemSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#updateQueue;
    await this.submit();
    const item = this.document as foundry.documents.Item;
    await enqueueAbilityMutation(item, async () => {
      const system = readAbilitySystem(item);
      if (!system.resource || !system.uses) return;
      const removal = prepareAbilityResourceRemoval(system.uses, system.resource);
      const referenced = system.uses.some(({ cost }) => cost.source === "resource");
      if (removal.confirmationRequired) {
        const confirmed = await DialogV2.confirm({
          classes: ["ordemparanormal2"],
          content: `<p>${game.i18n.localize(referenced ? "ORDEMPARANORMAL2.AbilitySheet.ConfirmRemoveCostResource" : "ORDEMPARANORMAL2.AbilitySheet.ConfirmRemoveResource")}</p>`,
          modal: true,
          rejectClose: false,
          window: { title: game.i18n.localize("ORDEMPARANORMAL2.AbilitySheet.RemoveResourceTitle") },
        });
        if (!confirmed) return;
      }
      await item.update({ "system.resource": null, "system.uses": removal.uses });
    });
  }

  protected override async _preClose(options: ApplicationClosingOptions): Promise<void> {
    await super._preClose(options);
    await this.#updateQueue;
    await Promise.all([...this.#useEditors.values()].map((editor) => editor.close()));
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    super._onClose(options);
    this.#useEditors.clear();
    this.tabGroups.sheet = "general";
  }
}
