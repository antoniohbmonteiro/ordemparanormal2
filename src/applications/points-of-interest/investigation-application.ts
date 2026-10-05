import type {
  ApplicationClosingOptions,
  ApplicationRenderContext,
} from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

import {
  type PoiInvestigationGmSkillView,
  type PoiInvestigationPlayerSkillView,
  type PoiInvestigationToolView,
  type PoiInvestigationGmToolInformationView,
} from "../../documents/item/point-of-interest-data";
import { aptitudeSpecializationLabel } from "../../config/skills";
import { SYSTEM_ID } from "../../config/system-config";
import { mutatePoi, subscribePoiInvalidation } from "../../adapters/foundry/points-of-interest/poi-runtime-queries";
import {
  requestPoiInvestigationView,
} from "../../adapters/foundry/points-of-interest/poi-investigation-query";
import type { PoiInvestigationResult } from "../../adapters/foundry/points-of-interest/resolve-poi-investigation-view";
import { performAgentCheckWithResult } from "../../features/checks/perform-agent-check";
import { selectInvestigationApproachCheck } from "./investigation-aptitude-selection";
import { openPoiAgentRevealDialog } from "./poi-agent-reveal-dialog";
import { resolveSceneInvestigationAgent } from "../../adapters/foundry/points-of-interest/resolve-investigation-agent";
import { commitPoiExamination } from "../../adapters/foundry/points-of-interest/commit-poi-examination";
import type { ExaminePoiInput } from "../../adapters/foundry/points-of-interest/examine-poi";
import { investigationToolInventory } from "../../adapters/foundry/equipment/investigation-tool-inventory";
import { useInvestigationTool } from "../../features/points-of-interest/use-investigation-tool";
import { equipmentUseFeedback, isEquipmentUseInFlight, subscribeEquipmentUse } from "../../features/equipment/use-equipment";

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
  readonly canExamine: boolean;
  readonly investigationActive: boolean;
  readonly feedback: string;
  readonly tools?: readonly PoiInvestigationToolView[];
  readonly discoveries?: readonly { readonly content: string }[];
  readonly toolInformation?: readonly PoiInvestigationGmToolInformationView[];
}

export interface PlayerInvestigationInformationRow {
  readonly isHidden: boolean;
  readonly difficulty?: number;
  readonly content?: string;
  readonly specializationLabel?: string;
}

export interface PlayerInvestigationSkillViewModel {
  readonly key: PoiInvestigationPlayerSkillView["key"];
  readonly name: string;
  readonly specialization?: string;
  readonly specializationLabel?: string;
  readonly publicDifficulties: readonly number[];
  readonly examineLabel: string;
  readonly canExamine: boolean;
  readonly informationCount: number;
  readonly rows: readonly PlayerInvestigationInformationRow[];
}

export interface GmInvestigationInformationRow {
  readonly id: string;
  readonly isFirst: boolean;
  readonly isDifficultyHidden: boolean;
  readonly isSituational: boolean;
  readonly condition: string;
  /** Alternative DT for this approach; separate from situational availability. */
  readonly difficultyOverride?: { readonly difficulty: number; readonly condition: string };
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
  feedback = "",
): InvestigationRenderContext {
  if (!result) {
    return { isReady: false, isPlayer: false, isGm: false, name, description: "", img: "", skills: [], message: localize("Loading"), canExamine: false, investigationActive: false, feedback };
  }
  if ("view" in result) {
    const base = {
      isReady: true as const,
      name: result.view.name || name,
      description: result.view.description,
      img: result.view.img,
      message: "",
      canExamine: agents.some(agent => agent.selected),
      investigationActive: !!result.view.investigationRunId,
      feedback,
    };
    if (result.view.audience === "gm") {
      return {
        ...base,
        isPlayer: false,
        isGm: true,
        gmContext: result.view.gmContext,
        toolInformation: result.view.toolInformation ?? [],
        skills: result.view.skills.map((skill) => ({
          key: skill.key,
          name: skill.name,
          informationCount: skill.information.length,
          information: skill.information.map((entry, index) => ({
            isFirst: index === 0,
            isDifficultyHidden: !entry.showDifficultyToPlayers,
            isSituational: entry.condition !== undefined,
            condition: entry.condition ?? "",
            ...(entry.difficultyOverride ? { difficultyOverride: { ...entry.difficultyOverride } } : {}),
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
      tools: result.view.tools ?? [],
      discoveries: result.view.discoveries ?? [],
      skills: result.view.skills.map((skill) => {
        const knownRows: PlayerInvestigationInformationRow[] = skill.information.map(entry => ({
          isHidden: entry.visibility === "hidden",
          content: entry.content,
          ...(entry.specialization ? { specializationLabel: aptitudeSpecializationLabel(entry.specialization) } : {}),
          ...(entry.visibility === "public" ? { difficulty: entry.difficulty } : {}),
        }));
        const knownPublicDifficulties = new Set(knownRows.map(row => row.difficulty));
        const rows = [...knownRows, ...skill.publicDifficulties
          .filter(difficulty => !knownPublicDifficulties.has(difficulty))
          .map(difficulty => ({ isHidden: false, difficulty }))];
        return {
          key: skill.key,
          name: skill.name,
          ...(skill.specialization ? { specialization: skill.specialization,
            specializationLabel: aptitudeSpecializationLabel(skill.specialization) } : {}),
          publicDifficulties: skill.publicDifficulties,
          examineLabel: `${localize("ExamineWith")} ${skill.name}`,
          canExamine: !!result.view.investigationRunId && agents.some(agent => agent.selected),
          informationCount: Math.max(1, rows.length),
          rows: rows.length ? rows : [{ isHidden: true }],
        };
      }),
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
    canExamine: false,
    investigationActive: false,
    feedback,
  };
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const open = new Map<string, OpenableApplication>();

/** Drops the Item from the open-registry (called by the Application on close). */
export function releaseInvestigationApplication(itemUuid: string): void {
  open.delete(investigationApplicationKey(itemUuid));
}

export class InvestigationApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      enlargeImage: InvestigationApplication.#onEnlargeImage,
      examine: InvestigationApplication.#onExamine,
      revealInformation: InvestigationApplication.#onRevealInformation,
      useTool: InvestigationApplication.#onUseTool,
    },
    classes: ["ordemparanormal2", "op2-investigation", "op2-poi-investigation"],
    window: { title: `${LOCALIZATION_ROOT}.Title`, resizable: true, contentClasses: ["op2-investigation-content"] },
    position: { width: 820, height: "auto" as const },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: INVESTIGATION_TEMPLATE, scrollable: [".op2-investigation-body"] },
  };

  #params: InvestigationApplicationParams;
  #result: PoiInvestigationResult | null = null;
  #resultActorUuid: string | null = null;
  #loadRevision = 0;
  #closed = false;
  #pendingExaminations = new Set<string>();
  #uncommittedExaminations = new Map<string, ExaminePoiInput>();
  #actorUuid: string | null = null;
  #feedback = "";
  #stopInvalidation: (() => void) | null = null;
  #controlTokenHook: number | null = null;
  #updateUserHook: number | null = null;
  #itemHooks: { name: string; id: number }[] = [];
  #stopEquipmentUse: (() => void) | null = null;
  #toolAborts = new Set<AbortController>();
  #currentRunId: string | null = null;
  #cancelTools(): void { for (const controller of this.#toolAborts) controller.abort(); this.#toolAborts.clear(); }

  constructor(params: InvestigationApplicationParams) {
    super({
      id: `op2-poi-investigation-${params.itemUuid.replaceAll(".", "-")}`,
      position: { width: 820, height: game.user?.isGM ? 960 : 650 },
    });
    this.#params = params;
  }

  protected override async _prepareContext(): Promise<InvestigationRenderContext> {
    const agents = this.#agents().map(actor => ({ uuid: actor.uuid, name: actor.name, selected: actor.uuid === this.#actorUuid }));
    if (!game.user?.isGM && this.#result && this.#resultActorUuid !== this.#actorUuid) {
      this.#result = null;
      queueMicrotask(() => { void this.refresh(); });
    }
    const context = buildInvestigationRenderContext(this.#params.name, this.#result, key =>
      game.i18n.localize(`${LOCALIZATION_ROOT}.${key}`),
      agents,
      this.#feedback,
    );
    const actor = !game.user?.isGM ? resolveSceneInvestigationAgent(this.#params.sceneId) : null;
    return actor ? { ...context, tools: investigationToolInventory(actor).map(tool => ({
      ...tool, canUse: tool.canUse && !isEquipmentUseInFlight(actor.uuid, tool.id) })) } : context;
  }

  #agents(): foundry.documents.Actor[] {
    const actor = resolveSceneInvestigationAgent(this.#params.sceneId);
    if (this.#actorUuid !== (actor?.uuid ?? null)) { this.#feedback = ""; this.#cancelTools(); }
    this.#actorUuid = actor?.uuid ?? null;
    return actor ? [actor] : [];
  }

  updateContext(params: InvestigationApplicationParams): void {
    if (params.sceneId !== this.#params.sceneId || params.itemUuid !== this.#params.itemUuid) this.#cancelTools();
    this.#params = params;
    this.#result = null;
    this.#resultActorUuid = null;
    this.#feedback = "";
    this.#uncommittedExaminations.clear();
    void this.refresh();
  }

  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    this.#stopInvalidation = subscribePoiInvalidation(() => { void this.refresh(); });
    if (!game.user?.isGM) {
      this.#stopEquipmentUse = subscribeEquipmentUse(actorUuid => {
        if (actorUuid === this.#actorUuid) void this.render();
      });
      for (const name of ["createItem", "updateItem", "deleteItem"]) {
        const id = Hooks.on(name, (item: unknown) => {
          const document = item as foundry.documents.Item;
          if (document.actor?.uuid === this.#actorUuid) void this.refresh();
        });
        this.#itemHooks.push({ name, id });
      }
      this.#controlTokenHook = Hooks.on("controlToken", () => { void this.refresh(); });
      this.#updateUserHook = Hooks.on("updateUser", (user: unknown) => {
        if (user && typeof user === "object" && "id" in user && user.id === game.user?.id) void this.refresh();
      });
    }
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
    this.#agents();
    const requestedActorUuid = this.#actorUuid;
    this.#result = null;
    void this.render();
    let result: PoiInvestigationResult;
    try {
      result = await requestPoiInvestigationView({
        sceneId: this.#params.sceneId,
        itemUuid: this.#params.itemUuid,
        ...(requestedActorUuid ? { actorUuid: requestedActorUuid } : {}),
      });
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to load POI investigation`, error);
      result = { error: "unavailable" };
    }
    if (this.#closed || revision !== this.#loadRevision) return;
    const runId = "view" in result ? result.view.investigationRunId ?? null : null;
    if (this.#currentRunId !== runId || !("view" in result)) this.#cancelTools();
    this.#currentRunId = runId;
    this.#result = result;
    this.#resultActorUuid = requestedActorUuid;
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
    if (view?.audience !== "player" || !view.investigationRunId
      || resolveSceneInvestigationAgent(this.#params.sceneId)?.uuid !== this.#resultActorUuid) return;
    const skill = view.skills.find(({ key, specialization }) => key === target.dataset.skill
      && (specialization ?? "") === (target.dataset.specialization ?? ""));
    const actionKey = `${skill?.key}:${skill?.specialization ?? ""}`;
    if (!skill || this.#pendingExaminations.has(actionKey)) return;
    const { sceneId, itemUuid } = this.#params;

    const actor = this.#agents().find(candidate => candidate.uuid === this.#actorUuid);
    if (!actor) {
      ui.notifications.error(game.i18n.localize(`${LOCALIZATION_ROOT}.NoAgent`));
      return;
    }

    const button = target.closest<HTMLButtonElement>("button") ??
      (target instanceof HTMLButtonElement ? target : null);
    this.#pendingExaminations.add(actionKey);
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    try {
      const commitKey = `${actor.uuid}:${actionKey}`;
      let pending = this.#uncommittedExaminations.get(commitKey);
      if (pending && pending.runId !== view.investigationRunId) {
        this.#uncommittedExaminations.delete(commitKey);
        pending = undefined;
      }
      if (!pending) {
        const selection = await selectInvestigationApproachCheck(skill);
        if (!selection) return;
        const check = await performAgentCheckWithResult(actor, selection);
        if (!check) return;
        pending = { sceneId, runId: view.investigationRunId,
          itemUuid, actorUuid: actor.uuid, skill: skill.key,
          ...(skill.key === "aptitude" ? { specialization: selection.key } : {}), messageId: check.messageId };
        this.#uncommittedExaminations.set(commitKey, pending);
      }
      if (this.#params.sceneId !== sceneId || this.#params.itemUuid !== itemUuid
        || resolveSceneInvestigationAgent(sceneId)?.uuid !== actor.uuid) return;
      const outcome = await commitPoiExamination(pending);
      if (!outcome.ok) throw new Error(`Examinar failed: ${outcome.reason}`);
      this.#uncommittedExaminations.delete(commitKey);
      const totalNew = outcome.passiveCount + outcome.newCount;
      this.#feedback = totalNew > 0
        ? `${totalNew} ${game.i18n.localize(`${LOCALIZATION_ROOT}.NewInformation`)}`
          + (outcome.lostPd ? ` · ${game.i18n.localize(`${LOCALIZATION_ROOT}.LostPd`)}` : "")
        : game.i18n.localize(`${LOCALIZATION_ROOT}.${outcome.lostPd ? "NoNewLostPd" : "NoNew"}`);
      await this.refresh();
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to examine POI`, error);
      ui.notifications.error(game.i18n.localize(`${LOCALIZATION_ROOT}.CheckFailed`));
    } finally {
      this.#pendingExaminations.delete(actionKey);
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
      .find(entry => entry.id === informationId) ?? view.toolInformation?.find(entry => entry.id === informationId);
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

  static async #onUseTool(this: InvestigationApplication, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (game.user?.isGM) return;
    const actor = resolveSceneInvestigationAgent(this.#params.sceneId);
    const equipmentId = target.dataset.itemId;
    if (!actor || !equipmentId) return;
    const equipment = actor.getEmbeddedDocument("Item", equipmentId) as foundry.documents.Item | null;
    if (equipment?.type !== "equipment" || (equipment.system as { category?: unknown }).category !== "tool") return;
    const { sceneId, itemUuid } = this.#params;
    const runId = this.#result && "view" in this.#result ? this.#result.view.investigationRunId ?? null : null;
    const button = target.closest<HTMLButtonElement>("button");
    const abort = new AbortController();
    this.#toolAborts.add(abort);
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
    try {
      const result = await useInvestigationTool(actor, equipmentId, { sceneId, itemUuid, runId }, () =>
        !this.#closed && this.#params.sceneId === sceneId && this.#params.itemUuid === itemUuid
        && resolveSceneInvestigationAgent(sceneId)?.uuid === actor.uuid && this.#currentRunId === runId, abort.signal);
      const feedback = result.status === "success"
        ? result.newCount > 0
          ? game.i18n.format(`${LOCALIZATION_ROOT}.${result.newCount === 1 ? "ToolDiscoverySingle" : "ToolDiscoveryMultiple"}`,
            { count: result.newCount })
          : result.manual ? equipmentUseFeedback(result) : game.i18n.localize(`${LOCALIZATION_ROOT}.ToolDiscoveryNone`)
        : equipmentUseFeedback(result);
      if (this.#closed || this.#params.sceneId !== sceneId || this.#params.itemUuid !== itemUuid
        || resolveSceneInvestigationAgent(sceneId)?.uuid !== actor.uuid || abort.signal.aborted || this.#currentRunId !== runId) return;
      if (feedback) {
        this.#feedback = feedback;
        if (result.status !== "success") ui.notifications.warn(feedback);
      }
      await this.refresh();
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to use Investigation tool`, error);
      ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.EquipmentUse.uncertain"));
    } finally {
      this.#toolAborts.delete(abort);
      if (button?.isConnected) { button.disabled = false; button.removeAttribute("aria-busy"); }
    }
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    this.#closed = true;
    this.#cancelTools();
    this.#stopInvalidation?.();
    this.#stopEquipmentUse?.();
    if (this.#controlTokenHook !== null) Hooks.off("controlToken", this.#controlTokenHook);
    if (this.#updateUserHook !== null) Hooks.off("updateUser", this.#updateUserHook);
    for (const hook of this.#itemHooks) Hooks.off(hook.name, hook.id);
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
