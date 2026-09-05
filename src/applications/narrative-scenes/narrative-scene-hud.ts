import type {
  ApplicationRenderContext,
  ApplicationRenderOptions,
} from "@client/applications/_types.mjs";
import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

import type { NarrativeScene } from "../../core/narrative-scenes/narrative-scene";

const NARRATIVE_SCENE_HUD_TEMPLATE =
  "systems/ordemparanormal2/templates/narrative-scenes/narrative-scene-hud.hbs";

interface NarrativeSceneHudContext extends ApplicationRenderContext {
  readonly scene: NarrativeScene;
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NarrativeSceneHud extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "ordemparanormal2-narrative-scene-hud",
    classes: ["ordemparanormal2", "op2-narrative-scene-hud"],
    window: {
      frame: false,
      positioned: false,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: NARRATIVE_SCENE_HUD_TEMPLATE },
  };

  #scene: NarrativeScene;

  constructor(scene: NarrativeScene) {
    super();
    this.#scene = scene;
  }

  setScene(scene: NarrativeScene): void {
    this.#scene = scene;
  }

  protected override async _prepareContext(
    _options: ApplicationRenderOptions,
  ): Promise<NarrativeSceneHudContext> {
    return { scene: this.#scene };
  }
}

let narrativeSceneHud: NarrativeSceneHud | null = null;

export async function synchronizeNarrativeSceneHud(
  scene: NarrativeScene | null,
): Promise<void> {
  if (!scene) {
    if (narrativeSceneHud?.rendered) await narrativeSceneHud.close();
    narrativeSceneHud = null;
    return;
  }

  if (!narrativeSceneHud) narrativeSceneHud = new NarrativeSceneHud(scene);
  else narrativeSceneHud.setScene(scene);

  await narrativeSceneHud.render({ force: true });
}
