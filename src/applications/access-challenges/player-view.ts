import type { ApplicationRenderContext } from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import type { PlayerProjection } from "../../application/access-challenges/session";
import { resolveAgentCheckParticipant } from "../../adapters/foundry/actors/resolve-agent-check-participant";
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
    window: { title: "Desafio de Acesso", resizable: true },
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
      window: { title: projection.type === "unlock" ? "Desafio: Destrancar" : "Desafio: Arrombar" } });
    this.#projection = projection;
    this.#draft = projection.type === "unlock" ? [...(projection.latest?.guess ?? [])] : [];
  }

  override get title(): string {
    if (this.#projection.status === "success" || this.#projection.status === "completed") return "Desafio: Concluído";
    if (this.#projection.status === "jammed") return "Desafio: Bloqueado";
    return this.#projection.type === "unlock" ? "Desafio: Destrancar" : "Desafio: Arrombar";
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
    return buildPlayerChallengeContext(this.#projection, this.#draft, this.#busy || this.#dialogOpen, this.#error, this.#chatWarning);
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
        if (result.chatPublished === false) this.#chatWarning = "Tentativa registrada; não foi possível publicar o teste no chat.";
      } else {
        this.#error = result.status === "forbidden" ? "Você não tem mais permissão de proprietário sobre este agente."
          : result.status === "invalid" ? "A tentativa não pôde ser validada. Confira os dados e tente novamente."
            : "Este desafio não está mais disponível.";
        if (result.status === "unavailable") {
          ui.notifications.warn("O Mestre deste desafio está indisponível. A janela será fechada.");
          await this.close();
          return;
        }
      }
    } catch {
      ui.notifications.warn("O Mestre deste desafio está indisponível. A janela será fechada.");
      await this.close(); return;
    } finally { this.#busy = false; }
    await this.render();
  }

  static async #attemptUnlock(this: AccessChallengePlayerView): Promise<void> {
    if (this.#projection.type !== "unlock" || this.#busy) return;
    const selects = [...this.element.querySelectorAll<HTMLSelectElement>("select[data-slot]")];
    const guess = selects.map(select => Number(select.value));
    if (guess.length !== this.#projection.diceCount || guess.some(value => !Number.isInteger(value) || value < 1 || value > (this.#projection as Extract<PlayerProjection, {type:"unlock"}>).die)) {
      this.#error = "Escolha um valor para cada posição."; await this.render(); return;
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
      if (!actor) { this.#error = "O agente não está mais disponível."; await this.render(); return; }
      const health = (actor.system as unknown as { resources: { health: { value: number } } }).resources.health.value;
      if (health < 1) { this.#error = "O agente não possui PV para tentar Arrombar."; await this.render(); return; }
      const choices = await prepareAgentCheckInteraction(actor, { kind: "skill", key: "athletics" },
        { lockedDifficulty: projection.difficulty, reservedHealth: 1 });
      if (!choices) return;
      this.#dialogOpen = false;
      await this.#send({ kind: "break", id: projection.id, revision: projection.revision,
        choices, messageMode: getCurrentMessageMode() });
    } catch (error) {
      console.error("ordemparanormal2 | Failed to prepare Break Check.", error);
      this.#error = "Não foi possível preparar o teste de Atletismo.";
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
