import type { ApplicationRenderOptions } from "@client/applications/_types.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";
import type FormDataExtended from "@client/applications/ux/form-data-extended.mjs";

import {
  readAgentAccentColor,
  readAgentProfileDefaultAccentColor,
} from "../../adapters/foundry/actors/read-agent-accent-color";
import { normalizeAccentColor } from "../../core/actors/agent-accent-color";

const AGENT_SHEET_SETTINGS_TEMPLATE =
  "systems/ordemparanormal2/templates/applications/agent-sheet-settings.hbs";

interface AgentSheetSettingsContext {
  readonly tabs?: never;
  readonly accentColor: string;
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AgentSheetSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      cancel: AgentSheetSettings.#onCancel,
      restoreDefault: AgentSheetSettings.#onRestoreDefault,
    },
    classes: ["ordemparanormal2", "agent-sheet-settings"],
    form: {
      closeOnSubmit: false,
      handler: AgentSheetSettings.#onSubmit,
      submitOnChange: false,
    },
    position: { width: 420 },
    tag: "form",
    window: {
      contentClasses: ["op2-agent-sheet-settings-content"],
      resizable: false,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: AGENT_SHEET_SETTINGS_TEMPLATE },
  };

  readonly #actor: foundry.documents.Actor;
  #draftAccentColor: string;

  constructor(actor: foundry.documents.Actor) {
    super({
      window: {
        title: game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Settings.Title",
        ),
      },
    });
    this.#actor = actor;
    this.#draftAccentColor = readAgentAccentColor(actor);
  }

  protected override async _prepareContext(
    _options: ApplicationRenderOptions & HandlebarsRenderOptions,
  ): Promise<AgentSheetSettingsContext> {
    return { accentColor: this.#draftAccentColor };
  }

  protected override _attachPartListeners(
    partId: string,
    htmlElement: HTMLElement,
    options: HandlebarsRenderOptions,
  ): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "main") return;

    const picker = htmlElement.querySelector<HTMLInputElement>(
      "[data-accent-picker]",
    );
    const hexadecimal = htmlElement.querySelector<HTMLInputElement>(
      "[data-accent-hex]",
    );
    const preview = htmlElement.querySelector<HTMLElement>(
      "[data-accent-preview]",
    );
    if (!picker || !hexadecimal || !preview) {
      throw new Error("Missing Agent Sheet accent settings controls.");
    }

    const showValidColor = (color: string): void => {
      picker.value = color;
      preview.style.backgroundColor = color;
      hexadecimal.removeAttribute("aria-invalid");
    };

    picker.addEventListener("input", () => {
      const normalized = normalizeAccentColor(picker.value);
      if (!normalized) return;
      this.#draftAccentColor = normalized;
      hexadecimal.value = normalized;
      showValidColor(normalized);
    });
    hexadecimal.addEventListener("input", () => {
      this.#draftAccentColor = hexadecimal.value;
      const normalized = normalizeAccentColor(hexadecimal.value);
      if (normalized) showValidColor(normalized);
      else hexadecimal.setAttribute("aria-invalid", "true");
    });
    hexadecimal.addEventListener("change", () => {
      const normalized = normalizeAccentColor(hexadecimal.value);
      if (!normalized) return;
      this.#draftAccentColor = normalized;
      hexadecimal.value = normalized;
      showValidColor(normalized);
    });
  }

  #setDraftAccentColor(color: string): void {
    this.#draftAccentColor = color;
    const picker = this.element.querySelector<HTMLInputElement>(
      "[data-accent-picker]",
    );
    const hexadecimal = this.element.querySelector<HTMLInputElement>(
      "[data-accent-hex]",
    );
    const preview = this.element.querySelector<HTMLElement>(
      "[data-accent-preview]",
    );
    if (picker) picker.value = color;
    if (hexadecimal) {
      hexadecimal.value = color;
      hexadecimal.removeAttribute("aria-invalid");
    }
    if (preview) preview.style.backgroundColor = color;
  }

  static async #onRestoreDefault(this: AgentSheetSettings): Promise<void> {
    this.#setDraftAccentColor(
      readAgentProfileDefaultAccentColor(this.#actor),
    );
  }

  static async #onCancel(this: AgentSheetSettings): Promise<void> {
    await this.close();
  }

  static async #onSubmit(
    this: AgentSheetSettings,
    event: Event,
    form: HTMLFormElement,
    _formData: FormDataExtended,
  ): Promise<void> {
    event.preventDefault();
    const field = form.elements.namedItem("accentColor");
    const normalized =
      field instanceof HTMLInputElement
        ? normalizeAccentColor(field.value)
        : null;
    if (!normalized) {
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Settings.Errors.InvalidColor",
        ),
      );
      return;
    }
    if (!this.#actor.canUserModify(game.user, "update")) {
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Settings.Errors.NotEditable",
        ),
      );
      return;
    }

    try {
      await this.#actor.update({
        "system.appearance.accentColor": normalized,
      });
      await this.close();
    } catch (error) {
      console.error("ordemparanormal2 | Failed to save Agent accent", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Settings.Errors.SaveFailed",
        ),
      );
    }
  }
}
