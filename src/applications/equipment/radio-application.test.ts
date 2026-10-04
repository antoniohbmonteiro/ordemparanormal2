import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RadioView, RadioResponse } from "../../application/equipment/radio-session";
import type { RadioController } from "../../features/equipment/radio-session";
import translations from "../../../lang/pt-BR.json";
class Application {
  render = vi.fn(async () => undefined); close = vi.fn(async () => undefined);
  _attachPartListeners() {} _onClose() {} async _onFirstRender() {}
}
let Module: typeof import("./radio-application");
const initial: RadioView = { sessionId: "opaque", revision: 1, equipmentName: "Rádio", formName: "Sintonizar",
  state: "active", removedCount: 2, active: [{ id: "a", text: "O sinal" }, { id: "b", text: "vem do porão" }], discarded: [] };
const localize = (key: string) => translations.ORDEMPARANORMAL2.Radio[key as keyof typeof translations.ORDEMPARANORMAL2.Radio] ?? key;
beforeEach(async () => {
  vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base: unknown) => base } } });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => localize(key.split(".").at(-1)!) } });
  Module = await import("./radio-application");
});
afterEach(() => vi.unstubAllGlobals());
const prepare = (app: InstanceType<typeof Module.RadioApplication>) =>
  (app as unknown as { _prepareContext(): Promise<ReturnType<typeof Module.radioViewModel>> })._prepareContext();
it("renders A–D, positions and restored controls without exposing the blind Check", async () => {
  const template = await readFile(new URL("../../../templates/equipment/radio-application.hbs", import.meta.url), "utf8");
  const h = Handlebars.create(); h.registerHelper("localize", (key: string) => localize(key.split(".").at(-1)!));
  const render = h.compile(template);
  const a = Module.radioViewModel(initial, false, false);
  expect(a.active[0]!.upDisabled).toBe(true); expect(a.active[1]!.downDisabled).toBe(true);
  expect(render(a)).toContain("2 conjuntos falsos removidos");
  const b = Module.radioViewModel({ ...initial, discarded: [{ id: "x", text: "na torre" }] }, false, false);
  expect(render(b)).toContain('data-action="restore"'); expect(render(b)).toContain("DESCARTADAS · 1 PEÇAS");
  for (const state of ["success", "failure"] as const) {
    const final = Module.radioViewModel({ ...initial, state }, false, false); const html = render(final);
    expect(final.active.every(piece => piece.disabled)).toBe(true); expect(html).toContain('role="status"');
    expect(html).not.toContain('data-action="finish"'); expect(html).toContain('data-action="close"');
    expect(final.composition).toBe(state === "success" ? "O sinal vem do porão" : "");
  }
  const forged = { ...initial, total: 18, result: { total: 18 }, trueFragments: ["hidden"] };
  expect(JSON.stringify(Module.radioViewModel(forged, false, false))).not.toMatch(/total|result|trueFragments|hidden/);
  expect(template).not.toMatch(/check|total|result|trueFragments|falseFragments/i);
});
it.each([0, 1, 2, 3])("shows %i removals immediately above the puzzle and retains exactly one status on rerender/resume", async removedCount => {
  const template = await readFile(new URL("../../../templates/equipment/radio-application.hbs", import.meta.url), "utf8");
  const h = Handlebars.create(); h.registerHelper("localize", (key: string) => localize(key.split(".").at(-1)!));
  const render = h.compile(template);
  const expected = removedCount === 0 ? "Nenhum conjunto falso foi removido" : removedCount === 1
    ? "1 conjunto falso removido" : `${removedCount} conjuntos falsos removidos`;
  for (const isGM of [false, true]) {
    vi.stubGlobal("game", { user: { isGM } });
    const resumed: RadioView = { ...initial, removedCount, revision: 4,
      discarded: [{ id: "discarded", text: "Peça descartada" }] };
    for (const busy of [false, true]) {
      const html = render(Module.radioViewModel(resumed, busy, false));
      expect(html).toContain(`<strong>${expected}</strong>`);
      expect(html.match(/class="op2-radio-technology-feedback"/g)).toHaveLength(1);
      expect(html).toContain('role="status" aria-atomic="true"');
      expect(html.indexOf(expected)).toBeLessThan(html.indexOf('data-action="moveUp"'));
      expect(html).not.toMatch(/snapshot|trueFragments|falseFragments|total/);
    }
  }
});
it("does not announce zero before Check confirmation, then displays the confirmed count before any piece action", async () => {
  let complete!: (value: RadioResponse) => void;
  const controller: RadioController = { initial: { ...initial, state: "prepared", removedCount: 0, active: [] },
    command: vi.fn(() => new Promise<RadioResponse>(resolve => { complete = resolve; })),
    cancel: vi.fn(async () => ({ status: "cancelled" as const })) };
  const app = new Module.RadioApplication(controller);
  expect((await prepare(app)).showRemovalFeedback).toBe(false);
  await (app as unknown as { _onFirstRender(context: object, options: object): Promise<void> })._onFirstRender({}, {});
  await vi.waitFor(() => expect(controller.command).toHaveBeenCalledExactlyOnceWith("start", undefined, undefined));
  expect((await prepare(app)).showRemovalFeedback).toBe(false);
  complete({ status: "radio", view: { ...initial, removedCount: 3 } });
  await vi.waitFor(async () => expect(await prepare(app)).toMatchObject({ showRemovalFeedback: true, removedCount: 3, loading: false }));
  expect(controller.command).toHaveBeenCalledOnce();
});
it("locks commands during awaits, restores focus after moves and cancels on close", async () => {
  let complete!: (value: RadioResponse) => void;
  const controller: RadioController = { initial, command: vi.fn(() => new Promise<RadioResponse>(resolve => { complete = resolve; })),
    cancel: vi.fn(async () => ({ status: "cancelled" as const })) };
  const app = new Module.RadioApplication(controller);
  let focusListener!: (event: { target: unknown }) => void;
  const focus = vi.fn(); const button = { dataset: { action: "moveDown", pieceId: "a" }, disabled: false, focus };
  const element = { addEventListener: (_event: string, listener: typeof focusListener) => { focusListener = listener; },
    querySelectorAll: () => [button] } as unknown as HTMLElement;
  const attach = () => (app as unknown as { _attachPartListeners(part: string, element: HTMLElement, options: object): void })._attachPartListeners("main", element, {});
  attach(); focusListener({ target: button }); attach(); expect(focus).toHaveBeenCalledOnce();
  const command = Module.RadioApplication.DEFAULT_OPTIONS.actions.moveDown.call(app, {} as PointerEvent, button as unknown as HTMLElement);
  await vi.waitFor(() => expect(controller.command).toHaveBeenCalledOnce());
  expect((await prepare(app)).busy).toBe(true); await Module.RadioApplication.DEFAULT_OPTIONS.actions.finish.call(app);
  expect(controller.command).toHaveBeenCalledExactlyOnceWith("move", "a", 1);
  complete({ status: "radio", view: { ...initial, revision: 2, active: [...initial.active].reverse() } }); await command;
  expect((await prepare(app)).active[1]!.id).toBe("a");
  (app as unknown as { _onClose(options: object): void })._onClose({}); expect(controller.cancel).toHaveBeenCalledOnce();
});
it("keeps partial finalization in a blocked retry state", async () => {
  const controller: RadioController = { initial, command: vi.fn(async () => ({ status: "partial" as const, stage: "discovery" as const })),
    cancel: vi.fn(async () => ({ status: "cancelled" as const })) };
  const app = new Module.RadioApplication(controller); await Module.RadioApplication.DEFAULT_OPTIONS.actions.finish.call(app);
  const context = await prepare(app); expect(context.retry).toBe(true); expect(context.terminal).toBe(false); expect(context.canFinish).toBe(false);
  await Module.RadioApplication.DEFAULT_OPTIONS.actions.retry.call(app); expect(controller.command).toHaveBeenCalledTimes(2);
});
it("moves keyboard focus to Close after a confirmed terminal result", async () => {
  const controller: RadioController = { initial, command: vi.fn(async () => ({ status: "radio" as const,
    view: { ...initial, state: "failure" as const, revision: 2 }, terminal: { status: "success" as const, newCount: 0, manual: false } })),
    cancel: vi.fn(async () => ({ status: "cancelled" as const })) };
  const app = new Module.RadioApplication(controller);
  let listener!: (event: { target: unknown }) => void;
  let buttons = [{ dataset: { action: "finish" }, disabled: false, focus: vi.fn() }];
  const element = { addEventListener: (_name: string, handler: typeof listener) => { listener = handler; }, querySelectorAll: () => buttons } as unknown as HTMLElement;
  const attach = () => (app as unknown as { _attachPartListeners(part: string, root: HTMLElement, options: object): void })._attachPartListeners("main", element, {});
  attach(); listener({ target: buttons[0] });
  await Module.RadioApplication.DEFAULT_OPTIONS.actions.finish.call(app);
  buttons = [{ dataset: { action: "close" }, disabled: false, focus: vi.fn() }]; attach();
  expect(buttons[0].focus).toHaveBeenCalledOnce();
});
