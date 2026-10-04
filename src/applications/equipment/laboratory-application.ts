import type { ApplicationClosingOptions, ApplicationRenderContext } from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import type { LaboratoryView } from "../../application/equipment/laboratory-session";
import { laboratoryBreaks } from "../../core/equipment/laboratory-challenge";
import type { LaboratoryController } from "../../features/equipment/laboratory-session";
import { equipmentUseFeedback } from "../../features/equipment/use-equipment";

export function laboratoryViewModel(view: LaboratoryView, selected: ReadonlySet<number>, busy: boolean, retry: boolean,
  localize: (key: string) => string) {
  const breaks = laboratoryBreaks(view.results);
  const active = view.state === "active";
  const terminal = !["prepared", "active"].includes(view.state);
  return { ...view, busy, retry, terminal, diceCount: Math.max(1, view.dice.length), success: view.state === "success", failure: view.state === "failure",
    outcome: terminal ? localize(view.state) : "", selectedCount: selected.size,
    canReroll: active && !busy && !retry && selected.size > 0 && selected.size <= view.remaining,
    canFinish: active && !busy && !retry,
    breaksSummary: breaks.length ? `${breaks.length} ${localize("Breaks")} · ${localize("Positions")} ${breaks.map(index => index + 1).join(", ")}`
      : localize("ValidSequence"),
    positions: view.dice.map((die, index) => ({ index, die, value: view.results[index] ?? "—",
      icon: `systems/ordemparanormal2/assets/icons/dice/d${die}.svg`, broken: breaks.includes(index), selected: selected.has(index),
      disabled: !active || busy || retry,
      accessibleLabel: `${localize("Position")} ${index + 1}, d${die}, ${view.results[index] ?? "—"}`,
      comparison: index === 0 ? localize("Start") : `${view.results[index] ?? "—"} ${breaks.includes(index) ? "<" : "≥"} ${view.results[index - 1] ?? "—"}`,
      comparisonLabel: breaks.includes(index) ? localize("Break") : localize("Valid"),
    })),
  };
}
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class LaboratoryApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-laboratory"],
    position: { width: 520, height: "auto" as const },
    window: { title: "ORDEMPARANORMAL2.Laboratory.Title", icon: "fa-solid fa-flask", resizable: true },
    actions: { selectDie: LaboratoryApplication.#select, reroll: LaboratoryApplication.#reroll,
      finish: LaboratoryApplication.#finish, retry: LaboratoryApplication.#onRetry, close: LaboratoryApplication.#close },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/equipment/laboratory-application.hbs", scrollable: [".op2-laboratory-body"] },
  };
  readonly #controller: LaboratoryController;
  #view: LaboratoryView;
  #selected = new Set<number>();
  #busy = false;
  #retry = false;
  #error = "";
  #closed = false;
  #focus: string | null = null;
  #lastAction: "start" | "reroll" | "finish" = "start";
  constructor(controller: LaboratoryController) {
    super({ id: `op2-laboratory-${controller.initial.sessionId}` });
    this.#controller = controller;
    this.#view = controller.initial;
    if (controller.initial.pendingCommand && ["start", "reroll", "finish"].includes(controller.initial.pendingCommand.action)) {
      this.#retry = true;
      this.#lastAction = controller.initial.pendingCommand.action as "start" | "reroll" | "finish";
    }
  }
  protected override async _prepareContext(): Promise<ApplicationRenderContext & ReturnType<typeof laboratoryViewModel> & { error: string }> {
    return { ...laboratoryViewModel(this.#view, this.#selected, this.#busy, this.#retry,
      key => game.i18n.localize(`ORDEMPARANORMAL2.Laboratory.${key}`)), error: this.#error };
  }
  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    if (this.#view.state === "prepared" && !this.#retry) void this.#command("start");
  }
  protected override _attachPartListeners(partId: string, element: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, element, options);
    element.addEventListener("focusin", event => {
      const target = event.target as HTMLElement;
      this.#focus = target.dataset.position !== undefined ? `[data-position="${target.dataset.position}"]`
        : target.dataset.action ? `[data-action="${target.dataset.action}"]` : null;
    });
    if (this.#focus) element.querySelector<HTMLButtonElement>(this.#focus)?.focus();
  }
  async #command(action: "start" | "reroll" | "finish"): Promise<void> {
    if (this.#busy || this.#closed) return;
    this.#lastAction = action;
    this.#busy = true;
    this.#error = "";
    await this.render();
    try {
      const result = await this.#controller.command(action, action === "reroll" ? [...this.#selected].sort((a, b) => a - b) : undefined);
      if (this.#closed) return;
      if (result.status === "laboratory") {
        this.#view = result.view;
        this.#selected.clear();
        this.#retry = false;
        if (result.terminal && result.terminal.status !== "success" && result.terminal.status !== "cancelled")
          this.#error = equipmentUseFeedback(result.terminal) ?? "";
      } else {
        this.#error = equipmentUseFeedback(result) ?? "";
        this.#retry = result.status === "partial" || result.status === "uncertain";
        if (!this.#retry) { await this.close(); return; }
      }
    } finally { this.#busy = false; if (!this.#closed) await this.render(); }
  }
  static async #select(this: LaboratoryApplication, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (this.#busy || this.#retry || this.#view.state !== "active") return;
    const index = Number(target.dataset.position);
    if (!Number.isInteger(index) || index < 0 || index >= this.#view.dice.length) return;
    if (this.#selected.has(index)) this.#selected.delete(index); else this.#selected.add(index);
    this.#focus = `[data-position="${index}"]`;
    await this.render();
  }
  static async #reroll(this: LaboratoryApplication): Promise<void> { await this.#command("reroll"); }
  static async #finish(this: LaboratoryApplication): Promise<void> { await this.#command("finish"); }
  static async #onRetry(this: LaboratoryApplication): Promise<void> { await this.#command(this.#lastAction); }
  static async #close(this: LaboratoryApplication): Promise<void> { await this.close(); }
  protected override _onClose(options: ApplicationClosingOptions): void {
    this.#closed = true;
    void this.#controller.cancel();
    super._onClose(options);
  }
}
