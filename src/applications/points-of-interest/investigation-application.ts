import type {
  ApplicationClosingOptions,
  ApplicationRenderContext,
} from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

import type {
  PoiInvestigationGmSkillView,
  PoiInvestigationPlayerSkillView,
} from "../../documents/item/point-of-interest-data";
import type { AgentCheckSelection } from "../../application/checks/build-agent-check";
import type { SkillKey } from "../../config/skills";
import { SYSTEM_ID } from "../../config/system-config";
import { resolveInvestigationAgent } from "../../adapters/foundry/points-of-interest/resolve-investigation-agent";
import {
  requestPoiInvestigationView,
} from "../../adapters/foundry/points-of-interest/poi-investigation-query";
import type { PoiInvestigationResult } from "../../adapters/foundry/points-of-interest/resolve-poi-investigation-view";
import { revealPoiInformation } from "../../adapters/foundry/points-of-interest/reveal-poi-information";
import { performAgentCheck } from "../../features/checks/perform-agent-check";
import { selectInvestigationAptitudeSpecialization } from "./investigation-aptitude-selection";

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
  readonly name: string;
  readonly description: string;
  readonly img: string;
  readonly message: string;
}

export interface PlayerInvestigationInformationRow {
  readonly isFirst: boolean;
  readonly isHidden: boolean;
  readonly isRevealed: boolean;
  readonly difficulty?: number;
  readonly content: string;
}

export interface PlayerInvestigationSkillViewModel {
  readonly key: PoiInvestigationPlayerSkillView["key"];
  readonly name: string;
  readonly examineLabel: string;
  readonly informationCount: number;
  readonly information: readonly PlayerInvestigationInformationRow[];
}

export interface GmInvestigationInformationRow {
  readonly id: string;
  readonly isFirst: boolean;
  readonly isDifficultyHidden: boolean;
  readonly isRevealed: boolean;
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
            id: entry.id,
            isRevealed: entry.isRevealed,
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
          isRevealed: Object.hasOwn(entry, "content"),
          content: entry.content ?? "",
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

/** Requeries one locally open placement after its replicated Region state changes. */
export function refreshInvestigationApplication(sceneId: string, regionId: string): void {
  void open.get(investigationApplicationKey(sceneId, regionId))?.refresh();
}

export class InvestigationApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      enlargeImage: InvestigationApplication.#onEnlargeImage,
      examine: InvestigationApplication.#onExamine,
      revealInformation: InvestigationApplication.#onRevealInformation,
    },
    classes: ["ordemparanormal2", "op2-poi-investigation"],
    window: { title: `${LOCALIZATION_ROOT}.Title`, resizable: true, contentClasses: ["op2-investigation-content"] },
    position: { width: 820, height: "auto" as const },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: INVESTIGATION_TEMPLATE, scrollable: [".op2-investigation-body"] },
  };

  #params: InvestigationApplicationParams;
  #result: PoiInvestigationResult | null = null;
  #loadRevision = 0;
  #closed = false;
  #pendingExaminations = new Set<SkillKey>();

  constructor(params: InvestigationApplicationParams) {
    super({
      id: `op2-poi-investigation-${params.sceneId}-${params.regionId}`,
    });
    this.#params = params;
  }

  protected override async _prepareContext(): Promise<InvestigationRenderContext> {
    return buildInvestigationRenderContext(this.#params.name, this.#result, key =>
      game.i18n.localize(`${LOCALIZATION_ROOT}.${key}`),
    );
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
    const revision = ++this.#loadRevision;
    let result: PoiInvestigationResult;
    try {
      result = await requestPoiInvestigationView({
        sceneId: this.#params.sceneId,
        regionId: this.#params.regionId,
      });
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to load POI investigation`, error);
      result = { error: "unavailable" };
    }
    if (this.#closed || revision !== this.#loadRevision) return;
    this.#result = result;
    await this.render();
  }

  async refresh(): Promise<void> {
    if (!this.#closed) await this.#load();
  }

  static async #onEnlargeImage(this: InvestigationApplication): Promise<void> {
    const view = this.#result && "view" in this.#result ? this.#result.view : null;
    if (!view?.img) return;

    const popout = new foundry.applications.apps.ImagePopout({
      src: view.img,
      window: { title: view.name },
    });
    await popout.render({ force: true });
  }

  static async #onExamine(
    this: InvestigationApplication,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const view = this.#result && "view" in this.#result ? this.#result.view : null;
    if (view?.audience !== "player") return;
    const skill = view.skills.find(({ key }) => key === target.dataset.skill);
    if (!skill || this.#pendingExaminations.has(skill.key)) return;

    const resolution = resolveInvestigationAgent();
    if (!resolution.ok) {
      const key = resolution.reason === "multiple" ? "MultipleAgents" : "NoAgent";
      ui.notifications.error(game.i18n.localize(`${LOCALIZATION_ROOT}.${key}`));
      return;
    }

    const button = target.closest<HTMLButtonElement>("button") ??
      (target instanceof HTMLButtonElement ? target : null);
    this.#pendingExaminations.add(skill.key);
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    try {
      let selection: AgentCheckSelection | null;
      if (skill.key === "aptitude") {
        const specialization = await selectInvestigationAptitudeSpecialization();
        selection = specialization
          ? { kind: "aptitude", key: specialization }
          : null;
      } else {
        selection = { kind: "skill", key: skill.key };
      }
      if (selection) await performAgentCheck(resolution.actor, selection);
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to examine POI`, error);
      ui.notifications.error(game.i18n.localize(`${LOCALIZATION_ROOT}.CheckFailed`));
    } finally {
      this.#pendingExaminations.delete(skill.key);
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    }
  }

  static async #onRevealInformation(
    this: InvestigationApplication,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const informationId = target.dataset.informationId;
    const view = this.#result && "view" in this.#result ? this.#result.view : null;
    if (!informationId || view?.audience !== "gm") return;
    const information = view.skills
      .flatMap(skill => skill.information)
      .find(entry => entry.id === informationId);
    if (!information || information.isRevealed) return;

    const button = target.closest<HTMLButtonElement>("button") ??
      (target instanceof HTMLButtonElement ? target : null);
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    try {
      const result = await revealPoiInformation({
        sceneId: this.#params.sceneId,
        regionId: this.#params.regionId,
        expectedItemUuid: view.associationItemUuid,
        informationId,
      });
      if (!result.ok) {
        ui.notifications.error(game.i18n.localize(`${LOCALIZATION_ROOT}.RevealFailed`));
        return;
      }
      await this.refresh();
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to reveal POI information`, error);
      ui.notifications.error(game.i18n.localize(`${LOCALIZATION_ROOT}.RevealFailed`));
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    }
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
  refresh(): unknown;
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
