import type {
  DocumentSheetRenderContext,
  DocumentSheetRenderOptions,
} from "@client/applications/api/document-sheet.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import { SKILL_KEYS } from "../../config/skills";
import { createPointOfInterestInformationId } from "../../adapters/foundry/points-of-interest/create-point-of-interest-information-id";
import {
  addPointOfInterestInformation,
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  readPointOfInterestInformationList,
  removePointOfInterestInformation,
  updatePointOfInterestInformation,
  type PointOfInterestInformation,
} from "../../documents/item/point-of-interest-data";
import {
  buildInformationRowViewModels,
  readInformationEditPatch,
  type InformationRowViewModel,
} from "./point-of-interest-information-editor";

const POI_SHEET_TEMPLATE =
  "systems/ordemparanormal2/templates/item/point-of-interest-item-sheet.hbs";

interface PointOfInterestItemSheetContext
  extends DocumentSheetRenderContext<foundry.documents.Item> {
  canViewAuthoring: boolean;
  poi?: {
    readonly name: string;
    readonly img: string;
    readonly uuid: string;
    readonly publicDescription: string;
    readonly enrichedPublicDescription: string;
    readonly gmContext: string;
    readonly enrichedGmContext: string;
    readonly showDifficultiesToPlayers: boolean;
    readonly information: readonly InformationRowViewModel[];
  };
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor } = foundry.applications.ux;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithItemSheetV2;

type InformationMutation = (
  list: readonly PointOfInterestInformation[],
) => readonly PointOfInterestInformation[];

export class PointOfInterestItemSheet extends HandlebarsApplicationMixin(
  ItemSheetV2,
) {
  static override DEFAULT_OPTIONS = {
    actions: {
      addInformation: PointOfInterestItemSheet.#onAddInformation,
      removeInformation: PointOfInterestItemSheet.#onRemoveInformation,
    },
    classes: ["ordemparanormal2", "point-of-interest-item-sheet"],
    form: { closeOnSubmit: false, submitOnChange: true },
    position: { width: 600, height: 640 },
    window: {
      contentClasses: ["op2-point-of-interest-item-sheet-content"],
      resizable: true,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: {
      template: POI_SHEET_TEMPLATE,
      scrollable: [".op2-poi-sheet__body"],
    },
  };

  #updateQueue: Promise<void> = Promise.resolve();

  get #canAuthor(): boolean {
    return game.user.isGM && this.isEditable;
  }

  #enqueue(operation: () => Promise<void>): void {
    this.#updateQueue = this.#updateQueue
      .then(operation)
      .catch(async (error: unknown) => {
        console.error(
          "ordemparanormal2 | Failed to update Point of Interest",
          error,
        );
        ui.notifications.error(
          game.i18n.localize(
            "ORDEMPARANORMAL2.PointOfInterestSheet.Errors.UpdateFailed",
          ),
        );
        await this.render({ force: true });
      });
  }

  #enqueueInformationChange(mutate: InformationMutation): void {
    this.#enqueue(async () => {
      const item = this.document as foundry.documents.Item;
      const next = mutate(readPointOfInterestInformationList(item.system));
      await item.update({ "system.information": next });
    });
  }

  protected override async _prepareContext(
    options: DocumentSheetRenderOptions & HandlebarsRenderOptions,
  ): Promise<PointOfInterestItemSheetContext> {
    const context = (await super._prepareContext(
      options,
    )) as DocumentSheetRenderContext<foundry.documents.Item>;
    const canViewAuthoring = game.user.isGM;

    if (!canViewAuthoring) {
      return { ...context, canViewAuthoring: false, editable: false };
    }

    const item = this.document as foundry.documents.Item;
    const system = item.system as unknown as {
      readonly publicDescription?: unknown;
      readonly gmContext?: unknown;
      readonly showDifficultiesToPlayers?: unknown;
    };
    const publicDescription =
      typeof system.publicDescription === "string"
        ? system.publicDescription
        : "";
    const gmContext =
      typeof system.gmContext === "string" ? system.gmContext : "";
    const [enrichedPublicDescription, enrichedGmContext] = await Promise.all([
      TextEditor.implementation.enrichHTML(publicDescription, {
        relativeTo: item,
        secrets: item.isOwner,
      }),
      TextEditor.implementation.enrichHTML(gmContext, {
        relativeTo: item,
        secrets: item.isOwner,
      }),
    ]);

    return {
      ...context,
      canViewAuthoring: true,
      editable: this.#canAuthor,
      poi: {
        name: item.name,
        img: item.img ?? "icons/svg/item-bag.svg",
        uuid: item.uuid,
        publicDescription,
        enrichedPublicDescription,
        gmContext,
        enrichedGmContext,
        showDifficultiesToPlayers: system.showDifficultiesToPlayers === true,
        information: buildInformationRowViewModels(
          readPointOfInterestInformationList(item.system),
        ),
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
    if (!this.#canAuthor) return;

    for (const control of htmlElement.querySelectorAll<
      HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement
    >("[data-information-edit]")) {
      control.addEventListener("change", (event) => {
        event.stopPropagation();
        if (!this.#canAuthor) {
          void this.render({ force: true });
          return;
        }

        const id = control.dataset.informationId;
        if (!id) return;

        const patch = readInformationEditPatch(
          control.dataset.informationField,
          control.value,
        );
        if (!patch) {
          ui.notifications.error(
            game.i18n.localize(
              "ORDEMPARANORMAL2.PointOfInterestSheet.Errors.InvalidInformation",
            ),
          );
          void this.render({ force: true });
          return;
        }

        this.#enqueueInformationChange((list) =>
          updatePointOfInterestInformation(list, id, patch),
        );
      });
    }

    htmlElement
      .querySelector<HTMLInputElement>("[data-difficulty-visibility-edit]")
      ?.addEventListener("change", (event) => {
        event.stopPropagation();
        const input = event.currentTarget as HTMLInputElement;
        if (!this.#canAuthor) {
          void this.render({ force: true });
          return;
        }

        const checked = input.checked;
        this.#enqueue(async () => {
          await (this.document as foundry.documents.Item).update({
            "system.showDifficultiesToPlayers": checked,
          });
        });
      });
  }

  static async #onAddInformation(
    this: PointOfInterestItemSheet,
  ): Promise<void> {
    if (!this.#canAuthor) return;

    await this.#updateQueue;
    await this.submit();

    const id = createPointOfInterestInformationId();
    this.#enqueueInformationChange((list) =>
      addPointOfInterestInformation(list, id, {
        skill: SKILL_KEYS[0],
        difficulty: POINT_OF_INTEREST_DIFFICULTY_MIN,
        content: "",
      }),
    );
  }

  static async #onRemoveInformation(
    this: PointOfInterestItemSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!this.#canAuthor) return;

    const id = target.dataset.informationId;
    if (!id) return;

    await this.#updateQueue;
    await this.submit();

    this.#enqueueInformationChange((list) =>
      removePointOfInterestInformation(list, id),
    );
  }
}
