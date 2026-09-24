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
import { aptitudeSpecializationLabel, type AptitudeSpecializationKey, type SkillKey } from "../../config/skills";
import { SYSTEM_ID } from "../../config/system-config";
import { mutatePoi, subscribePoiInvalidation } from "../../adapters/foundry/points-of-interest/poi-runtime-queries";
import {
  requestPoiInvestigationView,
} from "../../adapters/foundry/points-of-interest/poi-investigation-query";
import type { PoiInvestigationResult } from "../../adapters/foundry/points-of-interest/resolve-poi-investigation-view";
import { performAgentCheck } from "../../features/checks/perform-agent-check";
import { selectInvestigationAptitudeSpecialization } from "./investigation-aptitude-selection";
import { openPoiAgentRevealDialog } from "./poi-agent-reveal-dialog";

const INVESTIGATION_TEMPLATE =
  "systems/ordemparanormal2/templates/points-of-interest/investigation-application.hbs";

const LOCALIZATION_ROOT = "ORDEMPARANORMAL2.PointOfInterest.Investigation";

export interface InvestigationApplicationParams {
  readonly sceneId: string;
  readonly itemUuid: string;
  /** Safe display name already known from the canvas; shown while loading. */
  readonly name: string;
}

/** One Investigation Application per World POI. */
export function investigationApplicationKey(itemUuid: string): string {
  return itemUuid;
}

interface InvestigationRenderContextBase extends ApplicationRenderContext {
  readonly name: string;
  readonly description: string;
  readonly img: string;
  readonly message: string;
  readonly agents: readonly { readonly uuid: string; readonly name: string; readonly selected: boolean }[];
  readonly canExamine: boolean;
}

export interface PlayerInvestigationInformationRow {
  readonly isFirst: boolean;
  readonly isHidden: boolean;
  readonly isRevealed: boolean;
  readonly difficulty?: number;
  readonly content: string;
  readonly specializationLabel?: string;
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
  readonly knownCount: number;
  readonly difficulty: number;
  readonly content: string;
  readonly revealLabel: string;
  readonly specializationLabel?: string;
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
  agents: readonly { readonly uuid: string; readonly name: string; readonly selected: boolean }[] = [],
): InvestigationRenderContext {
  if (!result) {
    return { isReady: false, isPlayer: false, isGm: false, name, description: "", img: "", skills: [], message: localize("Loading"), agents, canExamine: false };
  }
  if ("view" in result) {
    const base = {
      isReady: true as const,
      name: result.view.name || name,
      description: result.view.description,
      img: result.view.img,
      message: "",
      agents,
      canExamine: agents.some(agent => agent.selected),
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
            knownCount: entry.knownCount,
            difficulty: entry.difficulty,
            content: entry.content,
            ...(entry.specialization ? { specializationLabel: aptitudeSpecializationLabel(entry.specialization) } : {}),
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
          ...(entry.specialization ? { specializationLabel: aptitudeSpecializationLabel(entry.specialization) } : {}),
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
    agents,
    canExamine: false,
  };
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const open = new Map<string, OpenableApplication>();

/** Drops the Item from the open-registry (called by the Application on close). */
export function releaseInvestigationApplication(itemUuid: string): void {
  open.delete(investigationApplicationKey(itemUuid));
}

export function refreshInvestigationApplications(): void {
  for (const app of open.values()) void app.refresh();
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
  #actorUuid: string | null = null;
  #stopInvalidation: (() => void) | null = null;

  constructor(params: InvestigationApplicationParams) {
    super({
      id: `op2-poi-investigation-${params.itemUuid.replaceAll(".", "-")}`,
    });
    this.#params = params;
  }

  protected override async _prepareContext(): Promise<InvestigationRenderContext> {
    const agents = this.#agents().map(actor => ({ uuid: actor.uuid, name: actor.name, selected: actor.uuid === this.#actorUuid }));
    return buildInvestigationRenderContext(this.#params.name, this.#result, key =>
      game.i18n.localize(`${LOCALIZATION_ROOT}.${key}`),
      agents,
    );
  }

  #agents(): foundry.documents.Actor[] {
    if (game.user?.isGM) return [];
    const agents = (game.actors.contents as foundry.documents.Actor[]).filter(actor => actor.type === "agent"
      && actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
    if (agents.length === 1 && !this.#actorUuid) this.#actorUuid = agents[0].uuid;
    if (this.#actorUuid && !agents.some(actor => actor.uuid === this.#actorUuid)) this.#actorUuid = null;
    return agents;
  }

  updateContext(params: InvestigationApplicationParams): void {
    this.#params = params;
    this.#result = null;
    void this.refresh();
  }

  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    this.#stopInvalidation = subscribePoiInvalidation(() => { void this.refresh(); });
    // Not awaited: _onFirstRender runs inside the render semaphore, and #load
    // triggers its own render() when the projection arrives.
    void this.#load();
  }

  protected override _attachPartListeners(partId: string, element: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, element, options);
    element.querySelector<HTMLSelectElement>("[data-poi-agent]")?.addEventListener("change", event => {
      this.#actorUuid = (event.currentTarget as HTMLSelectElement).value || null;
      this.#result = null;
      void this.refresh();
    });
    const image = element.querySelector<HTMLImageElement>("[data-poi-image]");
    if (!image) return;
    const fallback = () => { image.hidden = true; };
    image.addEventListener("error", fallback, { once: true });
    if (image.complete && image.naturalWidth === 0) fallback();
  }

  async #load(): Promise<void> {
    const revision = ++this.#loadRevision;
    this.#result = null;
    void this.render();
    let result: PoiInvestigationResult;
    try {
      result = await requestPoiInvestigationView({
        sceneId: this.#params.sceneId,
        itemUuid: this.#params.itemUuid,
        ...(this.#actorUuid ? { actorUuid: this.#actorUuid } : {}),
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

    const actor = this.#agents().find(candidate => candidate.uuid === this.#actorUuid);
    if (!actor) {
      ui.notifications.error(game.i18n.localize(`${LOCALIZATION_ROOT}.NoAgent`));
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
        const allowed = [...new Set(skill.information.flatMap(entry => entry.specialization ? [entry.specialization] : []))] as AptitudeSpecializationKey[];
        const specialization = await selectInvestigationAptitudeSpecialization(allowed);
        selection = specialization
          ? { kind: "aptitude", key: specialization }
          : null;
      } else {
        selection = { kind: "skill", key: skill.key };
      }
      if (selection) await performAgentCheck(actor, selection);
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
    if (!information) return;

    const button = target.closest<HTMLButtonElement>("button") ??
      (target instanceof HTMLButtonElement ? target : null);
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    try {
      const actorUuids = await openPoiAgentRevealDialog(this.#params.sceneId);
      if (!actorUuids?.length) return;
      const result = await mutatePoi({ action: "knowledge",
        sceneId: this.#params.sceneId,
        itemUuid: view.itemUuid,
        informationId,
        actorUuids,
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
    this.#stopInvalidation?.();
    super._onClose(options);
    releaseInvestigationApplication(this.#params.itemUuid);
  }
}

interface OpenableApplication {
  render(options: { force: true }): unknown;
  bringToFront(): unknown;
  refresh(): unknown;
  updateContext(params: InvestigationApplicationParams): unknown;
}

/**
 * Opens (or focuses) the Investigation Application for a World POI.
 * `create` is injectable for tests; production uses the real Application.
 */
export function openInvestigationApplication(
  params: InvestigationApplicationParams,
  create: (params: InvestigationApplicationParams) => OpenableApplication =
    params => new InvestigationApplication(params),
): void {
  const key = investigationApplicationKey(params.itemUuid);
  const existing = open.get(key);
  if (existing) {
    existing.updateContext(params);
    existing.bringToFront();
    return;
  }
  const app = create(params);
  open.set(key, app);
  void app.render({ force: true });
}
