import type { DocumentSheetRenderContext, DocumentSheetRenderOptions } from "@client/applications/api/document-sheet.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

import { isSkillKey } from "../../config/skills";
import { createPointOfInterestInformationId } from "../../adapters/foundry/points-of-interest/create-point-of-interest-information-id";
import {
  POINT_OF_INTEREST_ALWAYS_AVAILABLE,
  addPointOfInterestApproach, addPointOfInterestInformation, isAptitudeSpecializationKey,
  readPointOfInterestInformation,
  removePointOfInterestApproach, removePointOfInterestInformation,
  updatePointOfInterestApproach, updatePointOfInterestInformation, updatePointOfInterestInformationAvailability,
  type PointOfInterestApproach, type PointOfInterestInformation,
} from "../../documents/item/point-of-interest-data";
import { APTITUDE_OPTIONS, buildInformationViewModels, readApproachFieldPatch, readSituationalAvailability,
  type InformationViewModel } from "./point-of-interest-information-editor";
import { selectPoiApproach } from "./point-of-interest-approach-dialog";

const POI_SHEET_TEMPLATE = "systems/ordemparanormal2/templates/item/point-of-interest-item-sheet.hbs";
interface PointOfInterestItemSheetContext extends DocumentSheetRenderContext<foundry.documents.Item> {
  canViewAuthoring: boolean;
  poi?: {
    readonly name: string; readonly img: string; readonly uuid: string;
    readonly publicDescription: string; readonly enrichedPublicDescription: string;
    readonly gmContext: string; readonly enrichedGmContext: string;
    readonly information: readonly InformationViewModel[];
  };
}
const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { TextEditor } = foundry.applications.ux;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as FoundryApplicationSheetsWithItemSheetV2;
type InformationMutation = (list: readonly PointOfInterestInformation[]) => readonly PointOfInterestInformation[];

export class PointOfInterestItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      addInformation: PointOfInterestItemSheet.#onAddInformation,
      removeInformation: PointOfInterestItemSheet.#onRemoveInformation,
      addApproach: PointOfInterestItemSheet.#onAddApproach,
      removeApproach: PointOfInterestItemSheet.#onRemoveApproach,
    },
    classes: ["ordemparanormal2", "point-of-interest-item-sheet"],
    form: { closeOnSubmit: false, submitOnChange: true },
    position: { width: 680, height: 680 },
    window: { contentClasses: ["op2-point-of-interest-item-sheet-content"], resizable: true },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: POI_SHEET_TEMPLATE, scrollable: [".op2-poi-sheet__body"] },
  };
  #updateQueue: Promise<void> = Promise.resolve();
  /** Information switched to Situacional here whose condition is not saved yet (never persisted as such). */
  #pendingSituational = new Set<string>();
  get #canAuthor(): boolean { return game.user.isGM && this.isEditable; }
  #enqueue(operation: () => Promise<void>): void {
    this.#updateQueue = this.#updateQueue.then(operation).catch(async (error: unknown) => {
      console.error("ordemparanormal2 | Failed to update Point of Interest", error);
      ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Errors.UpdateFailed"));
      await this.render({ force: true });
    });
  }
  #enqueueInformationChange(mutate: InformationMutation): void {
    this.#enqueue(async () => {
      const item = this.document as foundry.documents.Item;
      const next = mutate(readPointOfInterestInformation(item.system));
      await item.update({ "system.information": next });
    });
  }
  protected override async _prepareContext(
    options: DocumentSheetRenderOptions & HandlebarsRenderOptions,
  ): Promise<PointOfInterestItemSheetContext> {
    const context = await super._prepareContext(options) as DocumentSheetRenderContext<foundry.documents.Item>;
    if (!game.user.isGM) return { ...context, canViewAuthoring: false, editable: false };
    const item = this.document as foundry.documents.Item;
    const system = item.system as unknown as { publicDescription?: unknown; gmContext?: unknown };
    const publicDescription = typeof system.publicDescription === "string" ? system.publicDescription : "";
    const gmContext = typeof system.gmContext === "string" ? system.gmContext : "";
    const [enrichedPublicDescription, enrichedGmContext] = await Promise.all([
      TextEditor.implementation.enrichHTML(publicDescription, { relativeTo: item, secrets: item.isOwner }),
      TextEditor.implementation.enrichHTML(gmContext, { relativeTo: item, secrets: item.isOwner }),
    ]);
    return { ...context, canViewAuthoring: true, editable: this.#canAuthor, poi: {
      name: item.name, img: item.img ?? "icons/svg/item-bag.svg", uuid: item.uuid,
      publicDescription, enrichedPublicDescription, gmContext, enrichedGmContext,
      information: buildInformationViewModels(readPointOfInterestInformation(item.system), this.#pendingSituational),
    } };
  }
  #onAvailabilityChange(id: string, control: HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement): void {
    const current = readPointOfInterestInformation((this.document as foundry.documents.Item).system)
      .find(entry => entry.id === id);
    if (!current) return;
    if (control.dataset.poiEdit === "condition") {
      const availability = readSituationalAvailability(control.value);
      if (!availability) {
        ui.notifications.warn(game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Errors.ConditionRequired"));
        void this.render();
        return;
      }
      this.#pendingSituational.delete(id);
      this.#enqueueInformationChange(list => updatePointOfInterestInformationAvailability(list, id, availability));
      return;
    }
    if (control.value === "situational") {
      if (current.availability.mode === "situational") return;
      // A situational information needs its condition, so the switch is saved together with the first condition.
      this.#pendingSituational.add(id);
      void this.render().then(() => this.element.querySelector<HTMLInputElement>(
        `[data-poi-edit="condition"][data-information-id="${CSS.escape(id)}"]`)?.focus());
      return;
    }
    this.#pendingSituational.delete(id);
    if (current.availability.mode === "always") { void this.render(); return; }
    this.#enqueueInformationChange(list => updatePointOfInterestInformationAvailability(list, id,
      POINT_OF_INTEREST_ALWAYS_AVAILABLE));
  }
  protected override _attachPartListeners(partId: string, htmlElement: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "main" || !this.#canAuthor) return;
    for (const control of htmlElement.querySelectorAll<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>("[data-poi-edit]")) {
      control.addEventListener("change", event => {
        event.stopPropagation();
        if (!this.#canAuthor) { void this.render({ force: true }); return; }
        const id = control.dataset.informationId;
        if (!id) return;
        if (control.dataset.poiEdit === "content") {
          this.#enqueueInformationChange(list => updatePointOfInterestInformation(list, id, control.value));
          return;
        }
        if (control.dataset.poiEdit === "availability" || control.dataset.poiEdit === "condition") {
          this.#onAvailabilityChange(id, control);
          return;
        }
        const index = Number(control.dataset.approachIndex);
        if (!Number.isInteger(index) || index < 0) return;
        const raw = control instanceof HTMLInputElement && control.type === "checkbox"
          ? String(control.checked) : control.value;
        this.#enqueueInformationChange(list => {
          const current = list.find(entry => entry.id === id)?.approaches[index];
          if (!current) throw new Error("Unknown POI approach.");
          let next: PointOfInterestApproach;
          if (control.dataset.poiEdit === "skill") {
            if (!isSkillKey(raw)) throw new Error("Invalid POI skill.");
            if (raw === "aptitude") {
              const used = new Set(list.find(entry => entry.id === id)!.approaches
                .filter((_, i) => i !== index && _.skill === "aptitude")
                .map(value => value.skill === "aptitude" ? value.specialization : ""));
              const specialization = APTITUDE_OPTIONS.find(option => !used.has(option.value))?.value;
              if (!specialization) throw new Error("No available POI specialization.");
              next = { skill: "aptitude", specialization, difficulty: current.difficulty,
                showDifficultyToPlayers: current.showDifficultyToPlayers };
            } else next = { skill: raw, difficulty: current.difficulty,
              showDifficultyToPlayers: current.showDifficultyToPlayers };
          } else if (control.dataset.poiEdit === "specialization") {
            if (current.skill !== "aptitude" || !isAptitudeSpecializationKey(raw)) throw new Error("Invalid POI specialization.");
            next = { ...current, specialization: raw };
          } else {
            const patch = readApproachFieldPatch(control.dataset.poiEdit, raw);
            if (!patch) throw new Error("Invalid POI approach value.");
            next = { ...current, ...patch };
          }
          return updatePointOfInterestApproach(list, id, index, next);
        });
      });
    }
  }
  static async #onAddInformation(this: PointOfInterestItemSheet): Promise<void> {
    if (!this.#canAuthor) return;
    await this.#updateQueue; await this.submit();
    const approach = await selectPoiApproach([]);
    if (!approach) return;
    const id = createPointOfInterestInformationId();
    this.#enqueueInformationChange(list => addPointOfInterestInformation(list, id, approach));
  }
  static async #onAddApproach(this: PointOfInterestItemSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#canAuthor) return;
    const id = target.dataset.informationId;
    if (!id) return;
    await this.#updateQueue; await this.submit();
    const existing = readPointOfInterestInformation((this.document as foundry.documents.Item).system)
      .find(entry => entry.id === id)?.approaches;
    if (!existing) return;
    const approach = await selectPoiApproach(existing);
    if (approach) this.#enqueueInformationChange(list => addPointOfInterestApproach(list, id, approach));
  }
  static async #onRemoveInformation(this: PointOfInterestItemSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#canAuthor) return;
    const id = target.dataset.informationId;
    if (!id) return;
    await this.#updateQueue; await this.submit();
    const confirmed = await DialogV2.confirm({ classes: ["ordemparanormal2"], modal: true, rejectClose: false,
      content: `<p>${game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Confirm.RemoveInformation")}</p>`,
      window: { title: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterestSheet.Actions.RemoveInformation") } });
    if (confirmed) this.#enqueueInformationChange(list => removePointOfInterestInformation(list, id));
  }
  static async #onRemoveApproach(this: PointOfInterestItemSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#canAuthor) return;
    const id = target.dataset.informationId;
    const index = Number(target.dataset.approachIndex);
    if (!id || !Number.isInteger(index) || index < 0) return;
    await this.#updateQueue; await this.submit();
    this.#enqueueInformationChange(list => removePointOfInterestApproach(list, id, index));
  }
}
