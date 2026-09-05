import type {
  ApplicationClosingOptions,
  ApplicationRenderContext,
  ApplicationRenderOptions,
} from "@client/applications/_types.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import { getActiveNarrativeScene } from "../../adapters/foundry/narrative-scenes/narrative-scene-setting";
import type { NarrativeScene } from "../../core/narrative-scenes/narrative-scene";
import {
  endNarrativeScene,
  startNarrativeScene,
} from "../../features/narrative-scenes/manage-narrative-scene";
import { SYSTEM_ID } from "../../config/system-config";

const NARRATIVE_SIDEBAR_TEMPLATE =
  "systems/ordemparanormal2/templates/narrative-scenes/narrative-sidebar-tab.hbs";

interface NarrativeSidebarContext extends ApplicationRenderContext {
  readonly canManage: boolean;
  readonly isActive: boolean;
  readonly scene: NarrativeScene | null;
}

function localize(key: string): string {
  return game.i18n.localize(`ORDEMPARANORMAL2.NarrativeScene.${key}`);
}

function notifyOperationFailure(error: unknown): void {
  console.error(`${SYSTEM_ID} | Failed to manage Narrative Scene.`, error);
  ui.notifications.error(localize("Errors.OperationFailed"));
}

const renderedNarrativeSidebarTabs = new Set<NarrativeSidebarTab>();
const { AbstractSidebarTab } = foundry.applications.sidebar;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class NarrativeSidebarTab extends HandlebarsApplicationMixin(
  AbstractSidebarTab,
) {
  static override tabName = "narrative";

  static override DEFAULT_OPTIONS = {
    actions: {
      startNarrativeScene: NarrativeSidebarTab.#onStartNarrativeScene,
      endNarrativeScene: NarrativeSidebarTab.#onEndNarrativeScene,
    },
    classes: [SYSTEM_ID, "op2-narrative-sidebar"],
    window: {
      title: "ORDEMPARANORMAL2.NarrativeScene.Sidebar.Tooltip",
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: NARRATIVE_SIDEBAR_TEMPLATE },
  };

  protected override async _prepareContext(
    _options: ApplicationRenderOptions & HandlebarsRenderOptions,
  ): Promise<NarrativeSidebarContext> {
    const scene = getActiveNarrativeScene();
    return {
      canManage: game.user.isGM,
      isActive: scene !== null,
      scene,
    };
  }

  protected override async _onRender(
    context: object,
    options: ApplicationRenderOptions & HandlebarsRenderOptions,
  ): Promise<void> {
    await super._onRender(context, options);
    renderedNarrativeSidebarTabs.add(this);
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    renderedNarrativeSidebarTabs.delete(this);
    super._onClose(options);
  }

  static async #onStartNarrativeScene(
    this: NarrativeSidebarTab,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!game.user.isGM) return;

    try {
      const input =
        target instanceof HTMLButtonElement
          ? target.form?.elements.namedItem("name")
          : null;
      const name = input instanceof HTMLInputElement ? input.value : "";
      const result = await startNarrativeScene(name);

      if (result.status === "invalid-name") {
        ui.notifications.warn(localize("Errors.InvalidName"));
      } else if (result.status === "already-active") {
        ui.notifications.warn(localize("Errors.AlreadyActive"));
      } else if (result.status === "forbidden") {
        ui.notifications.warn(localize("Errors.Forbidden"));
      }
    } catch (error) {
      notifyOperationFailure(error);
    }
  }

  static async #onEndNarrativeScene(
    this: NarrativeSidebarTab,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!game.user.isGM) return;

    try {
      const expectedSceneId = target.dataset.sceneId ?? "";
      const result = await endNarrativeScene(expectedSceneId);

      if (result.status === "stale") {
        ui.notifications.warn(localize("Errors.Stale"));
      } else if (result.status === "inactive") {
        ui.notifications.info(localize("Errors.Inactive"));
      } else if (result.status === "forbidden") {
        ui.notifications.warn(localize("Errors.Forbidden"));
      }
    } catch (error) {
      notifyOperationFailure(error);
    }
  }
}

export async function synchronizeNarrativeSidebarTabs(): Promise<void> {
  await Promise.all(
    [...renderedNarrativeSidebarTabs]
      .filter((tab) => tab.rendered)
      .map((tab) => tab.render()),
  );
}
