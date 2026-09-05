import type {
  DocumentSheetRenderContext,
  DocumentSheetRenderOptions,
} from "@client/applications/api/document-sheet.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import {
  readProfileAbilityGrants,
  type ProfileAbilityGrantData,
} from "../../documents/item/profile-ability-grant-data";
import {
  readStoredProfileAccentColor,
  SYSTEM_DEFAULT_ACCENT_COLOR,
} from "../../core/actors/agent-accent-color";
import { updateProfileAccentColor } from "../../features/profiles/manage-agent-profile";
import {
  evaluateProfileAbilityGrantDrop,
  persistProfileAbilityGrants,
  removeProfileAbilityGrant,
  resolveProfileAbilityGrantView,
} from "./profile-ability-grant-editor";

const PROFILE_SHEET_TEMPLATE =
  "systems/ordemparanormal2/templates/item/profile-item-sheet.hbs";

interface ProfileItemSheetContext
  extends DocumentSheetRenderContext<foundry.documents.Item> {
  profile: {
    readonly name: string;
    readonly img: string;
    readonly accentColor: string;
    readonly abilityGrants: readonly {
      readonly uuid: string;
      readonly name: string;
      readonly img: string;
      readonly available: boolean;
    }[];
  };
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithItemSheetV2;

export class ProfileItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      removeAbilityGrant: ProfileItemSheet.#onRemoveAbilityGrant,
    },
    classes: ["ordemparanormal2", "profile-item-sheet"],
    form: { closeOnSubmit: false, submitOnChange: true },
    position: { width: 520, height: 460 },
    window: {
      contentClasses: ["op2-profile-item-sheet-content"],
      resizable: true,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: PROFILE_SHEET_TEMPLATE },
  };

  #updateQueue: Promise<void> = Promise.resolve();

  async #updateAbilityGrants(
    grants: readonly ProfileAbilityGrantData[],
  ): Promise<void> {
    const operation = async () => {
      const item = this.document as foundry.documents.Item;
      await persistProfileAbilityGrants(item, grants);
    };

    this.#updateQueue = this.#updateQueue.then(operation);
    try {
      await this.#updateQueue;
    } catch (error) {
      console.error("ordemparanormal2 | Failed to update Profile grants", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.ProfileSheet.Errors.UpdateFailed",
        ),
      );
      this.#updateQueue = Promise.resolve();
      await this.render({ force: true });
      throw error;
    }
  }

  protected override async _prepareContext(
    options: DocumentSheetRenderOptions & HandlebarsRenderOptions,
  ): Promise<ProfileItemSheetContext> {
    const context = (await super._prepareContext(
      options,
    )) as DocumentSheetRenderContext<foundry.documents.Item>;
    const item = this.document as foundry.documents.Item;
    const abilityGrants = await Promise.all(
      readProfileAbilityGrants(item.system).map((grant) =>
        resolveProfileAbilityGrantView(grant),
      ),
    );
    return {
      ...context,
      profile: {
        name: item.name,
        img: item.img ?? "icons/svg/item-bag.svg",
        accentColor:
          readStoredProfileAccentColor(item.system) ??
          SYSTEM_DEFAULT_ACCENT_COLOR,
        abilityGrants,
      },
    };
  }

  async #updateAccentColor(input: string): Promise<void> {
    const operation = async () => {
      await updateProfileAccentColor(
        this.document as foundry.documents.Item,
        input,
      );
    };

    this.#updateQueue = this.#updateQueue.then(operation);
    try {
      await this.#updateQueue;
    } catch (error) {
      console.error("ordemparanormal2 | Failed to update Profile accent", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.ProfileSheet.Errors.AccentUpdateFailed",
        ),
      );
      this.#updateQueue = Promise.resolve();
      await this.render({ force: true });
    }
  }

  protected override _attachPartListeners(
    partId: string,
    htmlElement: HTMLElement,
    options: HandlebarsRenderOptions,
  ): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "main") return;

    htmlElement
      .querySelector<HTMLInputElement>("[data-profile-accent-color]")
      ?.addEventListener("change", (event) => {
        const input = event.currentTarget as HTMLInputElement;
        void this.#updateAccentColor(input.value);
      });
  }

  protected override async _onDropDocument<
    TDocument extends foundry.abstract.Document,
  >(
    _event: DragEvent,
    document: TDocument,
  ): Promise<TDocument | null> {
    if (!this.isEditable) return null;

    const item = this.document as foundry.documents.Item;
    const result = evaluateProfileAbilityGrantDrop(
      document as unknown as foundry.documents.Item,
      readProfileAbilityGrants(item.system),
    );
    if (result.status === "wrong-type") {
      ui.notifications.warn(
        game.i18n.localize(
          "ORDEMPARANORMAL2.ProfileSheet.Errors.AbilityOnly",
        ),
      );
      return null;
    }
    if (result.status === "embedded") {
      ui.notifications.warn(
        game.i18n.localize(
          "ORDEMPARANORMAL2.ProfileSheet.Errors.EmbeddedAbility",
        ),
      );
      return null;
    }

    if (result.status === "duplicate") {
      ui.notifications.info(
        game.i18n.localize(
          "ORDEMPARANORMAL2.ProfileSheet.Errors.DuplicateAbility",
        ),
      );
      return document;
    }

    await this.#updateAbilityGrants(result.grants);
    return document;
  }

  static async #onRemoveAbilityGrant(
    this: ProfileItemSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!this.isEditable) return;
    const uuid = target.dataset.grantUuid;
    if (!uuid) return;

    const item = this.document as foundry.documents.Item;
    const grants = removeProfileAbilityGrant(
      readProfileAbilityGrants(item.system),
      uuid,
    );
    await this.#updateAbilityGrants(grants);
  }
}
