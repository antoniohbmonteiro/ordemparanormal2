import type {
  DocumentSheetRenderContext,
  DocumentSheetRenderOptions,
} from "@client/applications/api/document-sheet.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import { isSkillKey, type SkillKey } from "../../config/skills";
import { createPointOfInterestInformationId } from "../../adapters/foundry/points-of-interest/create-point-of-interest-information-id";
import {
  addPointOfInterestInformation,
  addPointOfInterestSkill,
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  readPointOfInterestSkills,
  removePointOfInterestInformation,
  removePointOfInterestSkill,
  updatePointOfInterestInformation,
  type PointOfInterestSkill,
} from "../../documents/item/point-of-interest-data";
import {
  buildAvailableSkillOptions,
  buildSkillGroupViewModels,
  readInformationEditPatch,
  type PointOfInterestSkillGroupViewModel,
  type SkillOptionViewModel,
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
    readonly skills: readonly PointOfInterestSkillGroupViewModel[];
    readonly canAddSkill: boolean;
  };
}

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor } = foundry.applications.ux;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithItemSheetV2;

type SkillMutation = (
  list: readonly PointOfInterestSkill[],
) => readonly PointOfInterestSkill[];

async function selectSkill(
  options: readonly SkillOptionViewModel[],
): Promise<SkillKey | null> {
  if (options.length === 0) return null;
  const optionMarkup = options
    .map(({ value, label }) => `<option value="${value}">${label}</option>`)
    .join("");
  return DialogV2.input<SkillKey>({
    classes: ["ordemparanormal2"],
    content: `<label>${game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Fields.Skill")}<select name="skill">${optionMarkup}</select></label>`,
    modal: true,
    ok: {
      action: "add",
      label: "ORDEMPARANORMAL2.PointOfInterestSheet.Actions.AddSkill",
      callback: (_event, button) => {
        const field = button.form?.elements.namedItem("skill");
        if (!(field instanceof HTMLSelectElement) || !isSkillKey(field.value)) {
          throw new Error("Invalid Point of Interest skill selection.");
        }
        return field.value;
      },
    },
    rejectClose: false,
    window: {
      title: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.SelectSkillTitle"),
    },
  });
}

export class PointOfInterestItemSheet extends HandlebarsApplicationMixin(
  ItemSheetV2,
) {
  static override DEFAULT_OPTIONS = {
    actions: {
      addSkill: PointOfInterestItemSheet.#onAddSkill,
      addInformation: PointOfInterestItemSheet.#onAddInformation,
      removeInformation: PointOfInterestItemSheet.#onRemoveInformation,
      removeSkill: PointOfInterestItemSheet.#onRemoveSkill,
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

  #enqueueSkillChange(mutate: SkillMutation): void {
    this.#enqueue(async () => {
      const item = this.document as foundry.documents.Item;
      const next = mutate(readPointOfInterestSkills(item.system));
      await item.update({ "system.skills": next });
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
        skills: buildSkillGroupViewModels(readPointOfInterestSkills(item.system)),
        canAddSkill: buildAvailableSkillOptions(
          readPointOfInterestSkills(item.system),
        ).length > 0,
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
        const skill = control.dataset.skill;
        if (!id || !isSkillKey(skill)) return;

        const patch = readInformationEditPatch(
          control.dataset.informationField,
          control instanceof HTMLInputElement && control.type === "checkbox"
            ? String(control.checked)
            : control.value,
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

        this.#enqueueSkillChange((list) =>
          updatePointOfInterestInformation(list, skill, id, patch),
        );
      });
    }
  }

  static async #onAddSkill(this: PointOfInterestItemSheet): Promise<void> {
    if (!this.#canAuthor) return;
    await this.#updateQueue;
    await this.submit();

    const item = this.document as foundry.documents.Item;
    const options = buildAvailableSkillOptions(readPointOfInterestSkills(item.system));
    const skill = await selectSkill(options);
    if (!skill) return;

    const id = createPointOfInterestInformationId();
    this.#enqueueSkillChange((list) =>
      addPointOfInterestSkill(list, skill, id, {
        difficulty: POINT_OF_INTEREST_DIFFICULTY_MIN,
        content: "",
      }),
    );
  }

  static async #onAddInformation(
    this: PointOfInterestItemSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!this.#canAuthor) return;

    const skill = target.dataset.skill;
    if (!isSkillKey(skill)) return;

    await this.#updateQueue;
    await this.submit();

    const id = createPointOfInterestInformationId();
    this.#enqueueSkillChange((list) =>
      addPointOfInterestInformation(list, skill, id, {
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
    const skill = target.dataset.skill;
    if (!id || !isSkillKey(skill)) return;

    await this.#updateQueue;
    await this.submit();

    const item = this.document as foundry.documents.Item;
    const group = readPointOfInterestSkills(item.system).find(
      (candidate) => candidate.skill === skill,
    );
    if (!group?.information.some((entry) => entry.id === id)) return;
    if (group.information.length === 1) {
      const confirmed = await DialogV2.confirm({
        classes: ["ordemparanormal2"],
        content: `<p>${game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Confirm.RemoveLastInformation")}</p>`,
        modal: true,
        rejectClose: false,
        window: {
          title: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Confirm.RemoveSkillTitle"),
        },
      });
      if (!confirmed) return;
    }

    this.#enqueueSkillChange((list) =>
      removePointOfInterestInformation(list, skill, id),
    );
  }

  static async #onRemoveSkill(
    this: PointOfInterestItemSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!this.#canAuthor) return;
    const skill = target.dataset.skill;
    if (!isSkillKey(skill)) return;

    await this.#updateQueue;
    await this.submit();
    const item = this.document as foundry.documents.Item;
    const group = readPointOfInterestSkills(item.system).find(
      (candidate) => candidate.skill === skill,
    );
    if (!group) return;
    if (group.information.length > 1) {
      const confirmed = await DialogV2.confirm({
        classes: ["ordemparanormal2"],
        content: `<p>${game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Confirm.RemoveSkill")}</p>`,
        modal: true,
        rejectClose: false,
        window: {
          title: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Confirm.RemoveSkillTitle"),
        },
      });
      if (!confirmed) return;
    }

    this.#enqueueSkillChange((list) => removePointOfInterestSkill(list, skill));
  }
}
