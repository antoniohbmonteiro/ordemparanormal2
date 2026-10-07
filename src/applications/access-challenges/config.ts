import type { ApplicationRenderContext } from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import { encodeAgentCheckParticipantReference } from "../../application/checks/agent-check-participant";
import { listAgentCheckParticipantCandidates } from "../../adapters/foundry/actors/agent-check-participant-catalog";
import { createBreakChallenge, createUnlockChallenge } from "../../features/access-challenges/access-challenge-service";
import { accessChallengeErrorMessage } from "../../application/access-challenges/errors";
import { presentChallengeToPlayers } from "../../adapters/foundry/access-challenges/query-transport";
import { openGmChallengeView } from "./gm-view";
import type { NormalDieStep } from "../../core/dice/die-step";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
type ChallengeType = "unlock" | "break";

export class AccessChallengeConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-access", "op2-access-config"],
    position: { width: 320, height: "auto" as const },
    window: { title: "ORDEMPARANORMAL2.AccessChallenges.Titles.Config", resizable: true },
    actions: { submit: AccessChallengeConfig.#submit, cancel: AccessChallengeConfig.#cancel, selectMode: AccessChallengeConfig.#selectMode },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/access-challenges/config.hbs" },
  };
  readonly #type: ChallengeType;
  #participantKey = "";
  #obstacle = "";
  #diceCount = 3;
  #die: NormalDieStep = 6;
  #resistance = "";
  #secretMode: "random" | "manual" = "random";
  #manualSecret: string[] = [];
  #difficulty = "";
  #pa = "";
  #busy = false;
  #error = "";

  constructor(type: ChallengeType) { super(); this.#type = type; }

  protected override async _prepareContext(): Promise<ApplicationRenderContext & Record<string, unknown>> {
    const candidates = listAgentCheckParticipantCandidates();
    if (!candidates.some(candidate => encodeAgentCheckParticipantReference(candidate.reference) === this.#participantKey)) {
      this.#participantKey = candidates[0] ? encodeAgentCheckParticipantReference(candidates[0].reference) : "";
    }
    const chosen = candidates.find(candidate => encodeAgentCheckParticipantReference(candidate.reference) === this.#participantKey);
    const isUnlock = this.#type === "unlock";
    return { isUnlock, isBreak: !isUnlock, error: this.#error, busy: this.#busy,
      participantName: chosen?.label ?? game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Fields.NoAgent"), participantImg: chosen?.img ?? "icons/svg/mystery-man.svg",
      participantOptions: candidates.map(candidate => ({ value: encodeAgentCheckParticipantReference(candidate.reference),
        label: candidate.label, selected: encodeAgentCheckParticipantReference(candidate.reference) === this.#participantKey })),
      canStart: !!chosen && !this.#busy, wide: this.#diceCount > 3, diceCount: this.#diceCount, die: this.#die,
      obstacle: this.#obstacle, diceCountOptions: [1, 2, 3, 4, 5, 6].map(value => ({ value, selected: value === this.#diceCount })),
      dieOptions: [4, 6, 8, 10, 12].map(value => ({ value, label: `d${value}`, selected: value === this.#die })),
      resistance: this.#resistance, manual: this.#secretMode === "manual", random: this.#secretMode === "random",
      secretSlots: Array.from({ length: this.#diceCount }, (_, index) => ({ index, label: index + 1, options: Array.from({ length: this.#die }, (_, face) => ({
        value: face + 1, selected: this.#manualSecret[index] === String(face + 1) })) })),
      difficulty: this.#difficulty, pa: this.#pa };
  }

  protected override _attachPartListeners(partId: string, element: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, element, options);
    element.addEventListener("change", event => {
      const target = event.target as HTMLElement;
      if (!target.matches("[data-config-field]")) return;
      this.#readFields();
      const name = (target as HTMLInputElement).name;
      if (["participant", "diceCount", "die"].includes(name)) {
        void this.render().then(() => {
          if (name === "diceCount") this.setPosition({ width: this.#diceCount > 3 ? 480 : 320 });
        });
      }
    });
  }

  #readFields(): void {
    const root = this.element;
    const value = (name: string): string => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";
    this.#participantKey = value("participant");
    this.#obstacle = value("obstacle");
    if (this.#type === "unlock") {
      this.#diceCount = Number(value("diceCount"));
      this.#die = Number(value("die")) as NormalDieStep;
      this.#resistance = value("resistance");
      this.#manualSecret = [...root.querySelectorAll<HTMLSelectElement>("select[data-secret-slot]")].map(select => select.value);
    } else { this.#difficulty = value("difficulty"); this.#pa = value("pa"); }
  }

  static async #submit(this: AccessChallengeConfig): Promise<void> {
    if (this.#busy) return;
    this.#readFields();
    const chosen = listAgentCheckParticipantCandidates().find(candidate => encodeAgentCheckParticipantReference(candidate.reference) === this.#participantKey);
    if (!chosen) { this.#error = game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Validation.Participant"); await this.render(); return; }
    this.#busy = true; this.#error = ""; await this.render();
    try {
      const common = { participant: chosen.reference, obstacle: this.#obstacle };
      const session = this.#type === "unlock"
        ? await createUnlockChallenge({ ...common, diceCount: this.#diceCount, die: this.#die,
          resistance: Number(this.#resistance), secretMode: this.#secretMode,
          ...(this.#secretMode === "manual" ? { manualSecret: this.#manualSecret.map(Number) } : {}) })
        : await createBreakChallenge({ ...common, difficulty: Number(this.#difficulty), pa: Number(this.#pa) });
      await this.close();
      await openGmChallengeView(session.id);
      try { await presentChallengeToPlayers(session); }
      catch { ui.notifications.warn(game.i18n.localize("ORDEMPARANORMAL2.AccessChallenges.Warnings.CreatedPartialPresentation")); }
    } catch (error) {
      console.error("ordemparanormal2 | Access Challenge creation failed.", error);
      this.#error = accessChallengeErrorMessage(error, key => game.i18n.localize(key),
        (key, parameters) => game.i18n.format(key, parameters));
      this.#busy = false; await this.render();
    }
  }

  static async #cancel(this: AccessChallengeConfig): Promise<void> { await this.close(); }

  static async #selectMode(this: AccessChallengeConfig, _event: PointerEvent, target: HTMLElement): Promise<void> {
    this.#readFields();
    this.#secretMode = target.dataset.mode === "manual" ? "manual" : "random";
    await this.render();
  }
}

export async function openChallengeConfig(type: ChallengeType): Promise<void> {
  await new AccessChallengeConfig(type).render({ force: true });
}
