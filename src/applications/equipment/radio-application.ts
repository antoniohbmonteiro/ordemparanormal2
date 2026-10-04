import type { ApplicationClosingOptions, ApplicationRenderContext } from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import type { RadioCommand, RadioView } from "../../application/equipment/radio-session";
import type { RadioController } from "../../features/equipment/radio-session";
import { equipmentUseFeedback } from "../../features/equipment/use-equipment";

export function radioViewModel(view: RadioView, busy: boolean, retry: boolean) {
  const terminal = !["prepared", "active"].includes(view.state);
  const disabled = view.state !== "active" || busy || retry;
  return { equipmentName: view.equipmentName, formName: view.formName, removedCount: view.removedCount,
    showRemovalFeedback: ["active", "success", "failure"].includes(view.state),
    noFalseRemoved: view.removedCount === 0, oneFalseRemoved: view.removedCount === 1,
    loading: view.state === "prepared", terminal, success: view.state === "success", failure: view.state === "failure", busy, retry,
    canFinish: !disabled, composition: view.state === "success" ? view.active.map(piece => piece.text).join(" ") : "",
    active: view.active.map((piece, index) => ({ ...piece, position: index + 1, disabled,
      upDisabled: disabled || index === 0, downDisabled: disabled || index === view.active.length - 1 })),
    discarded: view.discarded.map(piece => ({ ...piece, disabled })),
  };
}
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class RadioApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = { classes: ["ordemparanormal2", "op2-radio"], position: { width: 520, height: "auto" as const },
    window: { title: "ORDEMPARANORMAL2.Radio.Title", icon: "op2-radio-icon", resizable: true },
    actions: { moveUp: RadioApplication.#up, moveDown: RadioApplication.#down, discard: RadioApplication.#discard,
      restore: RadioApplication.#restore, finish: RadioApplication.#finish, retry: RadioApplication.#retry, close: RadioApplication.#close } };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/equipment/radio-application.hbs", scrollable: [".op2-radio-body"] },
  };
  readonly #controller: RadioController;
  #view: RadioView;
  #busy = false;
  #retrying = false;
  #closed = false;
  #error = "";
  #focus: { action: string; id: string } | null = null;
  #last: { action: RadioCommand["action"]; id?: string; direction?: -1 | 1 } = { action: "start" };
  constructor(controller: RadioController) {
    super({ id: `op2-radio-${controller.initial.sessionId}` }); this.#controller = controller; this.#view = controller.initial;
    if (controller.initial.pendingCommand) { this.#retrying = true; this.#last = { action: controller.initial.pendingCommand.action }; }
  }
  protected override async _prepareContext(): Promise<ApplicationRenderContext & ReturnType<typeof radioViewModel> & { error: string }> {
    return { ...radioViewModel(this.#view, this.#busy, this.#retrying), error: this.#error };
  }
  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    if (this.#view.state === "prepared" && !this.#retrying) void this.#command("start");
  }
  protected override _attachPartListeners(partId: string, element: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, element, options);
    element.addEventListener("focusin", event => {
      const target = event.target as HTMLElement;
      if (target.dataset.action) this.#focus = { action: target.dataset.action, id: target.dataset.pieceId ?? "" };
    });
    if (this.#focus) {
      const focus = this.#focus;
      const buttons = [...element.querySelectorAll<HTMLButtonElement>("button[data-action]")];
      const target = buttons
        .find(button => button.dataset.action === focus.action && (button.dataset.pieceId ?? "") === focus.id);
      if (target && !target.disabled) target.focus();
      else if (focus.id) buttons.find(button => button.dataset.pieceId === focus.id && !button.disabled)?.focus();
      else if (!["prepared", "active"].includes(this.#view.state))
        buttons.find(button => button.dataset.action === "close")?.focus();
    }
  }
  async #command(action: RadioCommand["action"], id?: string, direction?: -1 | 1): Promise<void> {
    if (this.#busy || this.#closed) return;
    this.#last = { action, id, direction }; this.#busy = true; this.#error = ""; await this.render();
    try {
      const result = await this.#controller.command(action, id, direction);
      if (this.#closed) return;
      if (result.status === "radio") {
        this.#view = result.view; this.#retrying = false;
        if (result.terminal && result.terminal.status !== "success" && result.terminal.status !== "cancelled")
          this.#error = equipmentUseFeedback(result.terminal) ?? "";
        if (result.view.state === "cancelled") { await this.close(); return; }
      } else {
        this.#error = equipmentUseFeedback(result) ?? "";
        this.#retrying = result.status === "partial" || result.status === "uncertain";
        if (!this.#retrying) { await this.close(); return; }
      }
    } catch { this.#retrying = true; this.#error = equipmentUseFeedback({ status: "uncertain" }) ?? ""; }
    finally { this.#busy = false; if (!this.#closed) await this.render(); }
  }
  static async #up(this: RadioApplication, _event: PointerEvent, target: HTMLElement) { await this.#command("move", target.dataset.pieceId, -1); }
  static async #down(this: RadioApplication, _event: PointerEvent, target: HTMLElement) { await this.#command("move", target.dataset.pieceId, 1); }
  static async #discard(this: RadioApplication, _event: PointerEvent, target: HTMLElement) { await this.#command("discard", target.dataset.pieceId); }
  static async #restore(this: RadioApplication, _event: PointerEvent, target: HTMLElement) { await this.#command("restore", target.dataset.pieceId); }
  static async #finish(this: RadioApplication) { await this.#command("finish"); }
  static async #retry(this: RadioApplication) { await this.#command(this.#last.action, this.#last.id, this.#last.direction); }
  static async #close(this: RadioApplication) { await this.close(); }
  protected override _onClose(options: ApplicationClosingOptions): void {
    this.#closed = true; void this.#controller.cancel(); super._onClose(options);
  }
}
