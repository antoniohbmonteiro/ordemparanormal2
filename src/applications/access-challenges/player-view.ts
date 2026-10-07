import type { ApplicationRenderContext } from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import type { PlayerProjection } from "../../application/access-challenges/session";
import { resolveAgentCheckParticipant } from "../../adapters/foundry/actors/resolve-agent-check-participant";
import { readAgentCheckAbilities } from "../../adapters/foundry/abilities/read-agent-check-abilities";
import { dispatchChallengeAction } from "../../adapters/foundry/access-challenges/query-transport";
import { getCurrentMessageMode } from "../../adapters/foundry/chat/publish-check-message";
import { prepareAgentCheckInteraction } from "../../features/checks/resolve-agent-check-interaction";

import { buildPlayerChallengeContext } from "./view-model";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const playerViews = new Map<string, AccessChallengePlayerView>();

export class AccessChallengePlayerView extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-access", "op2-access-player"],
    position: { width: 360, height: "auto" as const },
    window: { title: "ORDEMPARANORMAL2.AccessChallenges.Titles.Config", resizable: true },
    actions: { attemptUnlock: AccessChallengePlayerView.#attemptUnlock, attemptBreak: AccessChallengePlayerView.#attemptBreak },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/access-challenges/player-view.hbs" },
  };

  #projection: PlayerProjection;
  #draft: number[];
  #busy = false;
  #dialogOpen = false;
  #error = "";
  #chatWarning = "";

  constructor(projection: PlayerProjection) {
    super({ id: `op2-access-player-${projection.id}`, position: { width: projection.type === "unlock"
      ? Math.max(360, 360 + (projection.diceCount - 3) * 60) : 360 },
      window: { title: projection.type === "unlock" ? "ORDEMPARANORMAL2.AccessChallenges.Titles.Unlock" : "ORDEMPARANORMAL2.AccessChallenges.Titles.Break" } });
    this.#projection = projection;
    this.#draft = projection.type === "unlock" ? [...(projection.latest?.guess ?? [])] : [];
  }

  override get title(): string {
    if (this.#projection.status === "success" || this.#projection.status === "completed") return game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Titles.Completed");
    if (this.#projection.status === "jammed") return game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Titles.Jammed");
    return game.i18n.localize(this.#projection.type === "unlock" ? "ORDEMPARANORMAL2.AccessChallenges.Titles.Unlock" : "ORDEMPARANORMAL2.AccessChallenges.Titles.Break");
  }

  get sessionId(): string { return this.#projection.id; }
  get gmUserId(): string { return this.#projection.gmUserId; }

  async accept(projection: PlayerProjection): Promise<void> {
    if (projection.revision < this.#projection.revision || projection.type !== this.#projection.type
      || projection.gmUserId !== this.#projection.gmUserId) return;
    const changed = projection.revision > this.#projection.revision;
    this.#projection = projection;
    if (changed && projection.type === "unlock") this.#draft = [...(projection.latest?.guess ?? this.#draft)];
    await this.render();
  }

  protected override async _prepareContext(): Promise<ApplicationRenderContext & ReturnType<typeof buildPlayerChallengeContext>> {
    return buildPlayerChallengeContext(this.#projection, this.#draft, this.#busy || this.#dialogOpen, this.#error, this.#chatWarning,
      key => game.i18n.localize(key));
  }

  protected override _attachPartListeners(partId: string, element: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, element, options);
    element.addEventListener("change", event => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !target.matches("[data-slot]")) return;
      this.#draft[Number(target.dataset.slot)] = Number(target.value);
      void this.render().then(() => { this.element.querySelector<HTMLSelectElement>(`select[data-slot="${target.dataset.slot}"]`)?.focus(); });
    });
  }

  async #send(action: Parameters<typeof dispatchChallengeAction>[1]): Promise<void> {
    if (this.#busy) return;
    this.#busy = true; this.#error = ""; this.#chatWarning = "";
    await this.render();
    try {
      const result = await dispatchChallengeAction(this.#projection.gmUserId, action);
      if (result.status === "ok" || result.status === "stale") {
        await this.accept(result.projection);
        if (result.chatPublished === false) this.#chatWarning = game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Messages.ChatPublicationFailed");
      } else {
        this.#error = result.status === "forbidden" ? game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.NoOwnership")
          : result.status === "invalid" ? game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.InvalidAttempt")
            : game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.Unavailable");
        if (result.status === "unavailable") {
          ui.notifications.warn(game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.GmUnavailable"));
          await this.close();
          return;
        }
      }
    } catch {
      ui.notifications.warn(game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.GmUnavailable"));
      await this.close(); return;
    } finally { this.#busy = false; }
    await this.render();
  }

  static async #attemptUnlock(this: AccessChallengePlayerView): Promise<void> {
    if (this.#projection.type !== "unlock" || this.#busy) return;
    const selects = [...this.element.querySelectorAll<HTMLSelectElement>("select[data-slot]")];
    const guess = selects.map(select => Number(select.value));
    if (guess.length !== this.#projection.diceCount || guess.some(value => !Number.isInteger(value) || value < 1 || value > (this.#projection as Extract<PlayerProjection, {type:"unlock"}>).die)) {
      this.#error = game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Validation.AllSlots"); await this.render(); return;
    }
    this.#draft = guess;
    await this.#send({ kind: "guess", id: this.#projection.id, revision: this.#projection.revision, guess });
  }

  static async #attemptBreak(this: AccessChallengePlayerView): Promise<void> {
    if (this.#projection.type !== "break" || this.#busy || this.#dialogOpen) return;
    const projection = this.#projection;
    this.#dialogOpen = true;
    await this.render();
    try {
      const actor = await resolveAgentCheckParticipant(projection.participant);
      if (!actor) { this.#error = game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.AgentUnavailable"); await this.render(); return; }
      const health = readAgentCheckAbilities(actor).health;
      if (health < 1) { this.#error = game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.InsufficientHealth"); await this.render(); return; }
      const choices = await prepareAgentCheckInteraction(actor, { kind: "skill", key: "athletics" },
        { lockedDifficulty: projection.difficulty, reservedHealth: 1 });
      if (!choices) return;
      this.#dialogOpen = false;
      await this.#send({ kind: "break", id: projection.id, revision: projection.revision,
        choices, messageMode: getCurrentMessageMode() });
    } catch (error) {
      console.error("ordemparanormal2 | Failed to prepare Break Check.", error);
      this.#error = game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Errors.PrepareCheck");
      await this.render();
    } finally {
      if (this.#dialogOpen) { this.#dialogOpen = false; await this.render(); }
    }
  }

  protected override _onClose(options: object): void {
    if (playerViews.get(this.sessionId) === this) playerViews.delete(this.sessionId);
    super._onClose(options as never);
  }
}

export async function presentPlayerChallengeView(projection: PlayerProjection): Promise<void> {
  const current = playerViews.get(projection.id);
  if (current) { await current.accept(projection); return; }
  const view = new AccessChallengePlayerView(projection);
  playerViews.set(projection.id, view);
  try { await view.render({ force: true }); }
  catch (error) { playerViews.delete(projection.id); throw error; }
}

export async function closePlayerChallengeView(id: string, gmUserId: string): Promise<void> {
  const view = playerViews.get(id);
  if (view?.gmUserId === gmUserId) await view.close();
}

export async function updatePlayerChallengeView(projection: PlayerProjection): Promise<void> {
  await playerViews.get(projection.id)?.accept(projection);
}
