import type { ApplicationRenderContext } from "@client/applications/_types.mjs";
import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import { activeAccessChallenges, subscribeAccessChallenges } from "../../features/access-challenges/access-challenge-service";
import { remainingBreakResistance } from "../../core/access-challenges/break";
import { presentChallengeToPlayers } from "../../adapters/foundry/access-challenges/query-transport";
import { openGmChallengeView } from "./gm-view";
import { openChallengeTypeChooser } from "./type-chooser";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
let manager: AccessChallengeManager | null = null;

export class AccessChallengeManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-access", "op2-access-manager"],
    position: { width: 340, height: "auto" as const },
    window: { title: "Desafios de Acesso", resizable: true },
    actions: { newChallenge: AccessChallengeManager.#new, openChallenge: AccessChallengeManager.#open },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/access-challenges/manager.hbs", scrollable: [".op2-access__manager-list"] },
  };
  #unsubscribe: (() => void) | null = null;

  protected override async _prepareContext(): Promise<ApplicationRenderContext & { challenges: readonly object[]; empty: boolean }> {
    const challenges = activeAccessChallenges().map(session => ({ id: session.id, name: session.participantName,
      img: session.participantImg, obstacle: session.obstacle,
      typeLabel: session.type === "unlock" ? "DESTRANCAR" : "ARROMBAR",
      typeClass: session.type, detail: session.type === "unlock"
        ? `Rodada ${session.state.round} · ${session.state.attemptsUsed}/${session.state.resistance} tentativas`
        : `${remainingBreakResistance(session.state)} / ${session.state.pa} restante` }));
    return { challenges, empty: challenges.length === 0 };
  }

  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    this.#unsubscribe = subscribeAccessChallenges(() => { void this.render(); });
  }

  static async #new(): Promise<void> { await openChallengeTypeChooser(); }

  static async #open(_event: PointerEvent, target: HTMLElement): Promise<void> {
    const id = target.dataset.sessionId;
    const session = activeAccessChallenges().find(candidate => candidate.id === id);
    if (!session) return;
    await openGmChallengeView(session.id);
    try { await presentChallengeToPlayers(session); }
    catch { ui.notifications.warn("Não foi possível apresentar o desafio a todos os jogadores. O desafio permanece ativo."); }
  }

  protected override _onClose(options: object): void {
    this.#unsubscribe?.();
    if (manager === this) manager = null;
    super._onClose(options as never);
  }
}

export async function openAccessChallengeManager(): Promise<void> {
  if (!game.user.isGM) return;
  manager ??= new AccessChallengeManager();
  await manager.render({ force: true });
}
