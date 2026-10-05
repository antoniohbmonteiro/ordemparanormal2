import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LaboratoryView, LaboratoryResponse } from "../../application/equipment/laboratory-session";
import type { LaboratoryController } from "../../features/equipment/laboratory-session";
import translations from "../../../lang/pt-BR.json";

class Application {
  render = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  _attachPartListeners() {}
  _onClose() {}
  async _onFirstRender() {}
}
let Module: typeof import("./laboratory-application");
const initial: LaboratoryView = { sessionId: "opaque", revision: 1, equipmentName: "Laboratório", formName: "Analisar",
  state: "active", dice: [4, 6, 8, 10, 10], results: [1, 4, 3, 6, 5], remaining: 3, ceiling: 10 };
const localize = (key: string) => translations.ORDEMPARANORMAL2.Laboratory[key as keyof typeof translations.ORDEMPARANORMAL2.Laboratory] ?? key;
beforeEach(async () => {
  vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base: unknown) => base } } });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => localize(key.split(".").at(-1)!) } });
  Module = await import("./laboratory-application");
});
afterEach(() => vi.unstubAllGlobals());
const prepare = (app: InstanceType<typeof Module.LaboratoryApplication>) =>
  (app as unknown as { _prepareContext(): Promise<ReturnType<typeof Module.laboratoryViewModel>> })._prepareContext();

it("presents A–E with isolated breaks, selection distinct from focus and confirmed final controls", async () => {
  const template = await readFile(new URL("../../../templates/equipment/laboratory-application.hbs", import.meta.url), "utf8");
  const handlebars = Handlebars.create();
  handlebars.registerHelper("localize", (key: string) => localize(key.split(".").at(-1)!));
  const render = handlebars.compile(template);
  const valid = Module.laboratoryViewModel({ ...initial, results: [1, 2, 2, 6, 7] }, new Set<number>(), false, false, localize);
  expect(valid.breaksSummary).toBe("Sequência válida · sem quebras");
  expect(valid.canFinish).toBe(true);
  const broken = Module.laboratoryViewModel(initial, new Set([1, 2]), false, false, localize);
  expect(broken.positions.filter(position => position.broken).map(position => position.index)).toEqual([2, 4]);
  expect(broken.positions.filter(position => position.selected).map(position => position.index)).toEqual([1, 2]);
  expect(broken.canReroll).toBe(true);
  expect(render(broken)).toContain('aria-pressed="true"');
  expect(render(broken)).not.toMatch(/>Posição \d/);
  expect(Module.laboratoryViewModel(initial, new Set([0, 1, 2, 3]), false, false, localize).canReroll).toBe(false);
  for (const state of ["success", "failure"] as const) {
    const final = Module.laboratoryViewModel({ ...initial, state }, new Set<number>(), false, false, localize);
    const html = render(final);
    expect(final.positions.every(position => position.disabled)).toBe(true);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-action="close"');
    expect(html).not.toContain('data-action="reroll"');
    expect(html).not.toContain('data-action="finish"');
  }
  const zero = Module.laboratoryViewModel({ ...initial, remaining: 0 }, new Set([0]), false, false, localize);
  expect(zero.canFinish).toBe(true);
  expect(zero.canReroll).toBe(false);
});
it("blocks commands while busy, restores selection focus and cancels through the controller on close", async () => {
  let complete!: (value: { status: "laboratory"; view: LaboratoryView }) => void;
  const controller: LaboratoryController = { initial,
    command: vi.fn(() => new Promise<LaboratoryResponse>(resolve => { complete = resolve; })),
    cancel: vi.fn(async () => ({ status: "cancelled" as const })) };
  const app = new Module.LaboratoryApplication(controller);
  const target = { dataset: { position: "2" } } as unknown as HTMLElement;
  await Module.LaboratoryApplication.DEFAULT_OPTIONS.actions.selectDie.call(app, {} as PointerEvent, target);
  expect((await prepare(app)).selectedCount).toBe(1);
  const focus = vi.fn();
  const selector = vi.fn(() => ({ focus }));
  (app as unknown as { _attachPartListeners(part: string, element: HTMLElement, options: object): void })
    ._attachPartListeners("main", { addEventListener: vi.fn(), querySelector: selector } as unknown as HTMLElement, {});
  expect(selector).toHaveBeenCalledWith('[data-position="2"]');
  expect(focus).toHaveBeenCalledOnce();
  const command = Module.LaboratoryApplication.DEFAULT_OPTIONS.actions.reroll.call(app);
  await vi.waitFor(() => expect(controller.command).toHaveBeenCalledOnce());
  expect((await prepare(app)).busy).toBe(true);
  await Module.LaboratoryApplication.DEFAULT_OPTIONS.actions.finish.call(app);
  expect(controller.command).toHaveBeenCalledExactlyOnceWith("reroll", [2]);
  complete({ status: "laboratory", view: { ...initial, results: [1, 4, 4, 6, 5], revision: 2, remaining: 2 } });
  await command;
  expect((await prepare(app)).selectedCount).toBe(0);
  (app as unknown as { _onClose(options: object): void })._onClose({});
  expect(controller.cancel).toHaveBeenCalledOnce();
});
it("keeps partial analysis in a retry state instead of showing a false terminal result", async () => {
  const controller: LaboratoryController = { initial,
    command: vi.fn(async () => ({ status: "partial" as const, stage: "analysis" as const })),
    cancel: vi.fn(async () => ({ status: "cancelled" as const })) };
  const app = new Module.LaboratoryApplication(controller);
  await Module.LaboratoryApplication.DEFAULT_OPTIONS.actions.finish.call(app);
  const context = await prepare(app);
  expect(context.retry).toBe(true);
  expect(context.terminal).toBe(false);
  expect(context.canFinish).toBe(false);
  await Module.LaboratoryApplication.DEFAULT_OPTIONS.actions.retry.call(app);
  expect(controller.command).toHaveBeenCalledTimes(2);
});
