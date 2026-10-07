import type { ApplicationRenderOptions } from "@client/applications/_types.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";
import type Draggable from "@client/applications/ux/draggable.mjs";

import { openOpposedCheckDialog } from "../checks/opposed-check-dialog";
import { createOpposedCheck } from "../../features/checks/create-opposed-check";
import { openCheckRequestDialog } from "../checks/check-request-dialog";
import { createCheckRequest } from "../../features/checks/create-check-request";
import { openAdventureImporter } from "../adventure-import/adventure-import-application";
import { openAccessChallengeManager } from "../access-challenges/manager";

const GM_TOOLKIT_TEMPLATE =
  "systems/ordemparanormal2/templates/applications/gm-toolkit.hbs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GmToolkit extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "ordemparanormal2-gm-toolkit",
    actions: {
      requestCheck: GmToolkit.#onRequestCheck,
      opposedCheck: GmToolkit.#onOpposedCheck,
      importAdventure: GmToolkit.#onImportAdventure,
      accessChallenges: GmToolkit.#onAccessChallenges,
    },
    classes: ["ordemparanormal2", "op2-gm-toolkit"],
    position: { top: 80, left: 220, width: "auto" as const, height: "auto" as const },
    window: {
      frame: false,
      minimizable: false,
      positioned: true,
      resizable: false,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: GM_TOOLKIT_TEMPLATE },
  };

  #draggable: Draggable | null = null;

  protected override _canRender(options: ApplicationRenderOptions): boolean | void {
    if (!game.user.isGM) return false;
    return super._canRender(options);
  }

  protected override async _onFirstRender(
    context: object,
    options: HandlebarsRenderOptions,
  ): Promise<void> {
    await super._onFirstRender(context, options);
    this.setPosition();
    const handle = this.element.querySelector<HTMLElement>("[data-drag-handle]");
    if (!handle) throw new Error("Missing GM Toolkit drag handle.");

    const DraggableImplementation = foundry.applications.ux.Draggable.implementation;
    this.#draggable = new DraggableImplementation(
      this,
      this.element,
      handle,
      false,
    );
  }

  static async #onRequestCheck(): Promise<void> {
    const result = await openCheckRequestDialog();
    if (!result) return;
    try {
      await createCheckRequest(result);
    } catch (error) {
      console.error("ordemparanormal2 | Failed to create Check Request.", error);
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.CheckRequestCard.Errors.Create"),
      );
    }
  }

  static async #onOpposedCheck(): Promise<void> {
    const result = await openOpposedCheckDialog();
    if (!result) return;

    try {
      await createOpposedCheck(result);
    } catch (error) {
      console.error("ordemparanormal2 | Failed to create Opposed Check.", error);
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.OpposedCheckCard.Errors.Create"),
      );
    }
  }

  static async #onImportAdventure(): Promise<void> {
    try {
      await openAdventureImporter();
    } catch (error) {
      console.error("ordemparanormal2 | Failed to open Adventure Importer.", error);
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.AdventureImport.Errors.Open"),
      );
    }
  }

  static async #onAccessChallenges(): Promise<void> {
    await openAccessChallengeManager();
  }
}
