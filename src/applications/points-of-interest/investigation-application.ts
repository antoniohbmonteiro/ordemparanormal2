import type {
  ApplicationClosingOptions,
  ApplicationRenderContext,
} from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

import type {
  PoiInvestigationGmSkillView,
  PoiInvestigationPlayerSkillView,
} from "../../documents/item/point-of-interest-data";
import { SYSTEM_ID } from "../../config/system-config";
import {
  requestPoiInvestigationView,
} from "../../adapters/foundry/points-of-interest/poi-investigation-query";
import type { PoiInvestigationResult } from "../../adapters/foundry/points-of-interest/resolve-poi-investigation-view";

const INVESTIGATION_TEMPLATE =
  "systems/ordemparanormal2/templates/points-of-interest/investigation-application.hbs";

const LOCALIZATION_ROOT = "ORDEMPARANORMAL2.PointOfInterest.Investigation";

export interface InvestigationApplicationParams {
  readonly sceneId: string;
  readonly regionId: string;
  /** Safe display name already known from the canvas; shown while loading. */
  readonly name: string;
}

/** One Investigation Application per placement (Scene + Region). */
export function investigationApplicationKey(sceneId: string, regionId: string): string {
  return `${sceneId}.${regionId}`;
}

interface InvestigationRenderContextBase extends ApplicationRenderContext {
  readonly actionHintId?: string;
  readonly name: string;
  readonly description: string;
  readonly img: string;
  readonly message: string;
}

export interface PlayerInvestigationInformationRow {
  readonly isFirst: boolean;
  readonly isHidden: boolean;
  readonly difficulty?: number;
}

export interface PlayerInvestigationSkillViewModel {
  readonly key: PoiInvestigationPlayerSkillView["key"];
  readonly name: string;
  readonly examineLabel: string;
  readonly informationCount: number;
  readonly information: readonly PlayerInvestigationInformationRow[];
}

export interface GmInvestigationInformationRow {
  readonly isFirst: boolean;
  readonly isDifficultyHidden: boolean;
  readonly difficulty: number;
  readonly content: string;
  readonly revealLabel: string;
}

export interface GmInvestigationSkillViewModel {
  readonly key: PoiInvestigationGmSkillView["key"];
  readonly name: string;
  readonly informationCount: number;
  readonly information: readonly GmInvestigationInformationRow[];
}

export type InvestigationRenderContext =
  | (InvestigationRenderContextBase & {
      readonly isReady: false;
      readonly isPlayer: false;
      readonly isGm: false;
      readonly skills: readonly [];
    })
  | (InvestigationRenderContextBase & {
      readonly isReady: true;
      readonly isPlayer: true;
      readonly isGm: false;
      readonly skills: readonly PlayerInvestigationSkillViewModel[];
    })
  | (InvestigationRenderContextBase & {
      readonly isReady: true;
      readonly isPlayer: false;
      readonly isGm: true;
      readonly skills: readonly GmInvestigationSkillViewModel[];
      readonly gmContext: string;
    });

/**
 * Pure view-model for the Application. `result === null` means still loading.
 */
export function buildInvestigationRenderContext(
  name: string,
  result: PoiInvestigationResult | null,
  localize: (key: string) => string,
): InvestigationRenderContext {
  if (!result) {
    return { isReady: false, isPlayer: false, isGm: false, name, description: "", img: "", skills: [], message: localize("Loading") };
  }
  if ("view" in result) {
    const base = {
      isReady: true as const,
      name: result.view.name || name,
      description: result.view.description,
      img: result.view.img,
      message: "",
    };
    if (result.view.audience === "gm") {
      return {
        ...base,
        isPlayer: false,
        isGm: true,
        gmContext: result.view.gmContext,
        skills: result.view.skills.map((skill) => ({
          key: skill.key,
          name: skill.name,
          informationCount: skill.information.length,
          information: skill.information.map((entry, index) => ({
            isFirst: index === 0,
            isDifficultyHidden: !entry.showDifficultyToPlayers,
            difficulty: entry.difficulty,
            content: entry.content,
            revealLabel: `${localize("Reveal")} — ${skill.name}`,
          })),
        })),
      };
    }
    return {
      ...base,
      isPlayer: true,
      isGm: false,
      skills: result.view.skills.map((skill) => ({
        key: skill.key,
        name: skill.name,
        examineLabel: `${localize("ExamineWith")} ${skill.name}`,
        informationCount: skill.information.length,
        information: skill.information.map((entry, index) => ({
          isFirst: index === 0,
          isHidden: entry.visibility === "hidden",
          ...(entry.visibility === "public" ? { difficulty: entry.difficulty } : {}),
        })),
      })),
    };
  }
  return {
    isReady: false,
    isPlayer: false,
    isGm: false,
    name,
    description: "",
    img: "",
    skills: [],
    message: localize(result.error === "no-gm" ? "NoGm" : "Error"),
  };
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const open = new Map<string, OpenableApplication>();

/** Drops the placement from the open-registry (called by the Application on close). */
export function releaseInvestigationApplication(sceneId: string, regionId: string): void {
  open.delete(investigationApplicationKey(sceneId, regionId));
}

export class InvestigationApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-poi-investigation"],
    window: { title: `${LOCALIZATION_ROOT}.Title`, resizable: true, contentClasses: ["op2-investigation-content"] },
    position: { width: 820, height: "auto" as const },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: INVESTIGATION_TEMPLATE, scrollable: [".op2-investigation-body"] },
  };

  #params: InvestigationApplicationParams;
  #result: PoiInvestigationResult | null = null;
  #closed = false;

  constructor(params: InvestigationApplicationParams) {
    super({
      id: `op2-poi-investigation-${params.sceneId}-${params.regionId}`,
    });
    this.#params = params;
  }

  protected override async _prepareContext(): Promise<InvestigationRenderContext> {
    return { ...buildInvestigationRenderContext(this.#params.name, this.#result, key =>
      game.i18n.localize(`${LOCALIZATION_ROOT}.${key}`),
    ), actionHintId: `${this.id}-action-hint` };
  }

  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    // Not awaited: _onFirstRender runs inside the render semaphore, and #load
    // triggers its own render() when the projection arrives.
    void this.#load();
  }

  protected override _attachPartListeners(partId: string, element: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, element, options);
    const image = element.querySelector<HTMLImageElement>("[data-poi-image]");
    if (!image) return;
    const fallback = () => { image.hidden = true; };
    image.addEventListener("error", fallback, { once: true });
    if (image.complete && image.naturalWidth === 0) fallback();
  }

  async #load(): Promise<void> {
    try {
      this.#result = await requestPoiInvestigationView({
        sceneId: this.#params.sceneId,
        regionId: this.#params.regionId,
      });
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to load POI investigation`, error);
      this.#result = { error: "unavailable" };
    }
    if (!this.#closed) await this.render();
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    this.#closed = true;
    super._onClose(options);
    releaseInvestigationApplication(this.#params.sceneId, this.#params.regionId);
  }
}

interface OpenableApplication {
  render(options: { force: true }): unknown;
  bringToFront(): unknown;
}

/**
 * Opens (or focuses) the Investigation Application for a POI placement.
 * `create` is injectable for tests; production uses the real Application.
 */
export function openInvestigationApplication(
  params: InvestigationApplicationParams,
  create: (params: InvestigationApplicationParams) => OpenableApplication =
    params => new InvestigationApplication(params),
): void {
  const key = investigationApplicationKey(params.sceneId, params.regionId);
  const existing = open.get(key);
  if (existing) {
    existing.bringToFront();
    return;
  }
  const app = create(params);
  open.set(key, app);
  void app.render({ force: true });
}
