import type { ApplicationClosingOptions } from "@client/applications/_types.mjs";
import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import {
  mutateInvestigationRuntime, requestInvestigationControl, type InvestigationControlView,
} from "../../adapters/foundry/points-of-interest/investigation-runtime";
import { subscribePoiInvalidation } from "../../adapters/foundry/points-of-interest/poi-runtime-queries";
import { openCreateInvestigationClueDialog } from "./investigation-clue-dialog";
import { openInvestigationControlAction } from "./investigation-control-actions";

const ROOT = "ORDEMPARANORMAL2.PointOfInterest.InvestigationControl";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const open = new Map<string, InvestigationControl>();

export class InvestigationControl extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-investigation", "op2-investigation-control"],
    window: { title: `${ROOT}.Title`, resizable: true },
    position: { width: 360, height: "auto" as const },
    actions: {
      start: InvestigationControl.#start,
      end: InvestigationControl.#end,
      advance: InvestigationControl.#advance,
      acted: InvestigationControl.#acted,
      createClue: InvestigationControl.#createClue,
      recap: InvestigationControl.#recap,
      share: InvestigationControl.#share,
    },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/points-of-interest/investigation-control.hbs" },
  };
  readonly #sceneId: string;
  #view: InvestigationControlView | null = null;
  #stop: (() => void) | null = null;
  #revision = 0;
  #busy = false;
  #closed = false;

  constructor(sceneId: string) {
    super({ id: `op2-investigation-control-${sceneId}` });
    this.#sceneId = sceneId;
  }

  protected override async _prepareContext(): Promise<Record<string, unknown>> {
    const runtime = this.#view?.runtime;
    const sceneName = game.scenes.get(this.#sceneId)?.name ?? "";
    const participants = this.#view?.participants.map(agent => ({
      ...agent, acted: !!runtime?.actedAgentUuids.includes(agent.uuid),
    })) ?? [];
    return {
      loading: this.#view === null,
      sceneName,
      active: !!runtime,
      round: runtime?.round ?? 0,
      actedCount: participants.filter(agent => agent.acted).length,
      total: participants.length,
      progressPercent: participants.length ? Math.round(100 * participants.filter(agent => agent.acted).length / participants.length) : 0,
      participants,
      recapUsed: !!runtime?.recapSuccessActorUuid,
      shareUsed: !!runtime?.shareSuccessActorUuid,
      busy: this.#busy,
    };
  }

  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    this.#stop = subscribePoiInvalidation(() => { void this.refresh(); });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.#closed) return;
    const revision = ++this.#revision;
    try {
      const view = await requestInvestigationControl(this.#sceneId);
      if (revision !== this.#revision) return;
      this.#view = view;
      if (!this.#closed) await this.render();
    } catch (error) {
      console.error("ordemparanormal2 | Investigation Control unavailable", error);
      ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
    }
  }

  async #mutate(action: "start" | "end" | "advance" | "acted", actorUuid?: string, acted?: boolean): Promise<void> {
    if (this.#busy) return;
    const runId = this.#view?.runtime?.runId;
    if (action !== "start" && !runId) return;
    this.#busy = true;
    try {
      const input = action === "start" ? { action, sceneId: this.#sceneId } as const
        : action === "acted" ? { action, sceneId: this.#sceneId, runId: runId!, actorUuid: actorUuid!, acted: acted! } as const
          : { action, sceneId: this.#sceneId, runId: runId! } as const;
      const result = await mutateInvestigationRuntime(input);
      if (!result.ok) ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
      await this.refresh();
    } catch (error) {
      console.error("ordemparanormal2 | Investigation Control mutation failed", error);
      ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
    } finally {
      this.#busy = false;
      if (!this.#closed) await this.render();
    }
  }

  static #start(this: InvestigationControl): Promise<void> { return this.#mutate("start"); }
  static #end(this: InvestigationControl): Promise<void> { return this.#mutate("end"); }
  static #advance(this: InvestigationControl): Promise<void> { return this.#mutate("advance"); }
  static #acted(this: InvestigationControl, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const uuid = target.closest<HTMLElement>("[data-agent-uuid]")?.dataset.agentUuid;
    const current = this.#view?.participants.find(agent => agent.uuid === uuid);
    if (!current || !this.#view?.runtime) return Promise.resolve();
    return this.#mutate("acted", current.uuid, !this.#view.runtime.actedAgentUuids.includes(current.uuid));
  }

  static async #createClue(this: InvestigationControl): Promise<void> {
    const runId = this.#view?.runtime?.runId;
    if (runId) await openCreateInvestigationClueDialog(this.#sceneId, runId);
  }

  static async #recap(this: InvestigationControl): Promise<void> {
    const view = this.#view;
    if (view?.runtime && !view.runtime.recapSuccessActorUuid)
      await openInvestigationControlAction(this.#sceneId, view.runtime.runId, "recap", view.participants);
  }

  static async #share(this: InvestigationControl): Promise<void> {
    const view = this.#view;
    if (view?.runtime && !view.runtime.shareSuccessActorUuid)
      await openInvestigationControlAction(this.#sceneId, view.runtime.runId, "share", view.participants);
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    this.#closed = true;
    this.#revision++;
    this.#stop?.();
    open.delete(this.#sceneId);
    super._onClose(options);
  }
}

export function openInvestigationControl(sceneId: string): void {
  if (!game.user?.isGM) return;
  const existing = open.get(sceneId);
  if (existing) { existing.bringToFront(); return; }
  const app = new InvestigationControl(sceneId);
  open.set(sceneId, app);
  void app.render({ force: true });
}
