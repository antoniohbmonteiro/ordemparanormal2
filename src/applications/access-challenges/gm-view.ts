import type { ApplicationRenderContext } from "@client/applications/_types.mjs";
import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import { cancelAccessChallenge, advanceChallengeRound, gmAccessChallenge, subscribeAccessChallenges } from "../../features/access-challenges/access-challenge-service";
import { closeChallengeForPlayers, updateChallengeForPlayers } from "../../adapters/foundry/access-challenges/query-transport";

import { buildGmChallengeContext } from "./view-model";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const gmViews = new Map<string, AccessChallengeGmView>();

export class AccessChallengeGmView extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-access", "op2-access-gm"],
    position: { width: 340, height: "auto" as const },
    window: { title: "GM: Monitoramento", resizable: true },
    actions: { advanceRound: AccessChallengeGmView.#advance, cancelChallenge: AccessChallengeGmView.#cancel },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/access-challenges/gm-view.hbs", scrollable: [".op2-access__body"] },
  };
  readonly #id: string;
  #unsubscribe: (() => void) | null = null;
  #busy = false;

  constructor(id: string) {
    const session = gmAccessChallenge(id);
    super({ id: `op2-access-gm-${id}`, position: { width: session?.type === "unlock" && session.state.secret.length > 3 ? 480 : 340 } });
    this.#id = id;
  }

  protected override async _prepareContext(): Promise<ApplicationRenderContext & ReturnType<typeof buildGmChallengeContext>> {
    const session = gmAccessChallenge(this.#id);
    if (!session) throw new Error("Este desafio não está mais disponível para o Mestre.");
    return buildGmChallengeContext(session, this.#busy);
  }

  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    this.#unsubscribe = subscribeAccessChallenges(() => { void this.render(); });
  }

  static async #advance(this: AccessChallengeGmView): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      const session = await advanceChallengeRound(this.#id);
      try { await updateChallengeForPlayers(session); }
      catch { ui.notifications.warn("Rodada avançada; não foi possível atualizar todas as janelas dos jogadores."); }
    } catch { ui.notifications.error("Não foi possível avançar a rodada."); }
    finally { this.#busy = false; await this.render(); }
  }

  static async #cancel(this: AccessChallengeGmView): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      const session = await cancelAccessChallenge(this.#id);
      try { await closeChallengeForPlayers(session); }
      catch { ui.notifications.warn("Desafio cancelado; não foi possível fechar a janela remota do jogador."); }
      await this.close();
    } catch { ui.notifications.error("Não foi possível cancelar o desafio."); this.#busy = false; await this.render(); }
  }

  protected override _onClose(options: object): void {
    this.#unsubscribe?.();
    if (gmViews.get(this.#id) === this) gmViews.delete(this.#id);
    super._onClose(options as never);
  }
}

export async function openGmChallengeView(id: string): Promise<void> {
  let view = gmViews.get(id);
  if (!view) { view = new AccessChallengeGmView(id); gmViews.set(id, view); }
  await view.render({ force: true });
}
