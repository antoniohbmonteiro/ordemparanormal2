import type { ApplicationRenderOptions } from "@client/applications/_types.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import type {
  SingleItemCatalogEntry,
  SingleItemCatalogSource,
} from "../../adapters/foundry/items/single-item-catalog";

const SINGLE_ITEM_PICKER_TEMPLATE =
  "systems/ordemparanormal2/templates/applications/single-embedded-item-picker.hbs";

export interface SingleEmbeddedItemPickerDefinition {
  readonly localizationRoot: string;
  readonly logLabel: string;
  loadEntries(): Promise<readonly SingleItemCatalogEntry[]>;
  resolveSource(source: SingleItemCatalogSource): Promise<foundry.documents.Item>;
  getCurrent(actor: foundry.documents.Actor): foundry.documents.Item | null;
  setCurrent(
    actor: foundry.documents.Actor,
    source: foundry.documents.Item,
  ): Promise<foundry.documents.Item>;
  clearCurrent(actor: foundry.documents.Actor): Promise<void>;
}

interface PickerContext {
  readonly tabs?: never;
  readonly labels: {
    readonly current: string;
    readonly search: string;
    readonly emptyCatalog: string;
    readonly emptySearch: string;
    readonly edit: string;
    readonly clear: string;
  };
  readonly current: {
    readonly selected: boolean;
    readonly name: string;
    readonly img: string;
  };
  readonly groups: readonly {
    readonly origin: string;
    readonly entries: readonly (SingleItemCatalogEntry & {
      readonly sourceKind: SingleItemCatalogSource["kind"];
      readonly packId: string;
      readonly documentId: string;
      readonly searchText: string;
    })[];
  }[];
  readonly hasEntries: boolean;
}

function localize(
  definition: SingleEmbeddedItemPickerDefinition,
  key: string,
): string {
  return game.i18n.localize(`${definition.localizationRoot}.${key}`);
}

function localizedDialogContent(message: string): string {
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  return paragraph.outerHTML;
}

export async function confirmSingleItemReplacement(
  definition: SingleEmbeddedItemPickerDefinition,
): Promise<boolean> {
  const result = await foundry.applications.api.DialogV2.confirm({
    classes: ["ordemparanormal2"],
    content: localizedDialogContent(localize(definition, "Confirm.Replace")),
    modal: true,
    rejectClose: false,
    window: { title: localize(definition, "Confirm.ReplaceTitle") },
  });
  return result === true;
}

export async function confirmSingleItemRemoval(
  definition: SingleEmbeddedItemPickerDefinition,
): Promise<boolean> {
  const result = await foundry.applications.api.DialogV2.confirm({
    classes: ["ordemparanormal2"],
    content: localizedDialogContent(localize(definition, "Confirm.Remove")),
    modal: true,
    rejectClose: false,
    window: { title: localize(definition, "Confirm.RemoveTitle") },
  });
  return result === true;
}

function groupEntries(
  entries: readonly SingleItemCatalogEntry[],
): PickerContext["groups"] {
  const groups = new Map<string, SingleItemCatalogEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.origin) ?? [];
    group.push(entry);
    groups.set(entry.origin, group);
  }
  return [...groups.entries()].map(([origin, group]) => ({
    origin,
    entries: group.map((entry) => ({
      ...entry,
      sourceKind: entry.source.kind,
      packId: entry.source.kind === "compendium" ? entry.source.packId : "",
      documentId: entry.source.documentId,
      searchText: `${entry.name} ${entry.origin}`.toLocaleLowerCase("pt-BR"),
    })),
  }));
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SingleEmbeddedItemPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      clearItem: SingleEmbeddedItemPicker.#onClearItem,
      editCurrent: SingleEmbeddedItemPicker.#onEditCurrent,
      selectItem: SingleEmbeddedItemPicker.#onSelectItem,
    },
    classes: ["ordemparanormal2", "single-embedded-item-picker"],
    position: { width: 500, height: 600 },
    window: {
      contentClasses: ["op2-single-item-picker-content"],
      resizable: true,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: {
      template: SINGLE_ITEM_PICKER_TEMPLATE,
      scrollable: [".op2-single-item-picker__catalog"],
    },
  };

  readonly #actor: foundry.documents.Actor;
  readonly #definition: SingleEmbeddedItemPickerDefinition;
  #entries: readonly SingleItemCatalogEntry[] = [];

  constructor(
    actor: foundry.documents.Actor,
    definition: SingleEmbeddedItemPickerDefinition,
  ) {
    super({ window: { title: localize(definition, "Title") } });
    this.#actor = actor;
    this.#definition = definition;
  }

  #notifyFailure(error: unknown): void {
    console.error(
      `ordemparanormal2 | Failed to manage Agent ${this.#definition.logLabel}`,
      error,
    );
    ui.notifications.error(localize(this.#definition, "Errors.OperationFailed"));
  }

  protected override async _prepareContext(
    _options: ApplicationRenderOptions & HandlebarsRenderOptions,
  ): Promise<PickerContext> {
    this.#entries = await this.#definition.loadEntries();
    const current = this.#definition.getCurrent(this.#actor);
    return {
      labels: {
        current: localize(this.#definition, "Current"),
        search: localize(this.#definition, "Search"),
        emptyCatalog: localize(this.#definition, "EmptyCatalog"),
        emptySearch: localize(this.#definition, "EmptySearch"),
        edit: localize(this.#definition, "Actions.Edit"),
        clear: localize(this.#definition, "Actions.Clear"),
      },
      current: current
        ? {
            selected: true,
            name: current.name,
            img: current.img ?? "icons/svg/item-bag.svg",
          }
        : {
            selected: false,
            name: localize(this.#definition, "None"),
            img: "icons/svg/item-bag.svg",
          },
      groups: groupEntries(this.#entries),
      hasEntries: this.#entries.length > 0,
    };
  }

  protected override _attachPartListeners(
    partId: string,
    htmlElement: HTMLElement,
    options: HandlebarsRenderOptions,
  ): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "main") return;
    const search = htmlElement.querySelector<HTMLInputElement>(
      "[data-item-search]",
    );
    search?.addEventListener("input", () => {
      const term = search.value.trim().toLocaleLowerCase("pt-BR");
      let visibleCount = 0;
      for (const row of htmlElement.querySelectorAll<HTMLElement>(
        "[data-item-entry]",
      )) {
        const visible = !term || (row.dataset.searchText ?? "").includes(term);
        row.hidden = !visible;
        if (visible) visibleCount += 1;
      }
      for (const group of htmlElement.querySelectorAll<HTMLElement>(
        "[data-item-group]",
      )) {
        group.hidden = !group.querySelector("[data-item-entry]:not([hidden])");
      }
      const emptySearch = htmlElement.querySelector<HTMLElement>(
        "[data-empty-search]",
      );
      if (emptySearch) {
        emptySearch.hidden =
          visibleCount > 0 || !htmlElement.querySelector("[data-item-entry]");
      }
    });
  }

  static async #onSelectItem(
    this: SingleEmbeddedItemPicker,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!this.#actor.isOwner) return;
    const source: SingleItemCatalogSource | null =
      target.dataset.sourceKind === "world" && target.dataset.documentId
        ? { kind: "world", documentId: target.dataset.documentId }
        : target.dataset.sourceKind === "compendium" &&
            target.dataset.packId &&
            target.dataset.documentId
          ? {
              kind: "compendium",
              packId: target.dataset.packId,
              documentId: target.dataset.documentId,
            }
          : null;
    if (!source) return;
    try {
      const current = this.#definition.getCurrent(this.#actor);
      if (
        current &&
        !(await confirmSingleItemReplacement(this.#definition))
      ) {
        return;
      }
      const item = await this.#definition.resolveSource(source);
      await this.#definition.setCurrent(this.#actor, item);
      await this.close();
    } catch (error) {
      this.#notifyFailure(error);
    }
  }

  static async #onClearItem(this: SingleEmbeddedItemPicker): Promise<void> {
    if (!this.#actor.isOwner || !this.#definition.getCurrent(this.#actor)) return;
    if (!(await confirmSingleItemRemoval(this.#definition))) return;
    try {
      await this.#definition.clearCurrent(this.#actor);
      await this.close();
    } catch (error) {
      this.#notifyFailure(error);
    }
  }

  static #onEditCurrent(this: SingleEmbeddedItemPicker): void {
    if (!this.#actor.isOwner) return;
    this.#definition.getCurrent(this.#actor)?.sheet.render(true);
  }
}
