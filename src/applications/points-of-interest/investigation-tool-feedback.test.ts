import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import translations from "../../../lang/pt-BR.json";
import type { EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";
import type { InvestigationRenderContext } from "./investigation-application";

const state = vi.hoisted(() => ({
  actor: null as foundry.documents.Actor | null,
  projection: vi.fn(),
  select: vi.fn(),
}));
vi.mock("../../adapters/foundry/points-of-interest/resolve-investigation-agent", () => ({
  resolveSceneInvestigationAgent: () => state.actor,
}));
vi.mock("../../adapters/foundry/points-of-interest/poi-investigation-query", () => ({
  requestPoiInvestigationView: state.projection,
}));
vi.mock("../../applications/equipment/equipment-use-dialog", () => ({ selectEquipmentUse: state.select }));

function localize(key: string): string {
  const value = key.split(".").reduce((object, part) => object && typeof object === "object"
    ? (object as Record<string, unknown>)[part] : undefined, translations as unknown);
  return typeof value === "string" ? value : key;
}
const messages = translations.ORDEMPARANORMAL2.EquipmentUse;
let sequence = 0;

beforeEach(() => {
  state.projection.mockReset();
  state.select.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

async function fixture(result: EquipmentUseResult = { status: "success", newCount: 0, manual: true }) {
  class Application {
    static DEFAULT_OPTIONS = {};
    render = vi.fn(async () => undefined);
  }
  vi.stubGlobal("foundry", { applications: { api: {
    ApplicationV2: Application, HandlebarsApplicationMixin: (base: unknown) => base,
  } } });
  const equipment = { id: "tool", type: "equipment", name: "Medidor", img: "icon.svg", sort: 0,
    system: { category: "tool", uses: { value: 3, max: 5 }, useForms: [
      { id: "scan", name: "Varredura", description: "", consumesUse: true },
    ] } };
  const actor = { uuid: `Actor.feedback${++sequence}`, name: "Agente", isOwner: true, items: [equipment],
    getEmbeddedDocument: (_type: string, id: string) => id === equipment.id ? equipment : null,
  } as unknown as foundry.documents.Actor;
  state.actor = actor;
  const dispatch = vi.fn(async () => result);
  vi.stubGlobal("game", { user: { id: "owner", isGM: false }, users: { activeGM: { id: "gm", query: dispatch } },
    i18n: { localize, format: (key: string, values: Record<string, unknown>) =>
      localize(key).replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name])) } });
  const notifications = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  vi.stubGlobal("ui", { notifications });
  const information: { content: string; visibility: "public"; difficulty: number }[] = [];
  const discoveries: { content: string }[] = [];
  state.projection.mockImplementation(async () => ({ view: { audience: "player", itemUuid: "Item.poi",
    name: "Local", description: "", img: "", investigationRunId: "run", tools: [],
    skills: [{ key: "perception", name: "Percepção", publicDifficulties: [6], information: [...information] }],
    discoveries: [...discoveries] } }));
  const { InvestigationApplication } = await import("./investigation-application");
  const app = new InvestigationApplication({ sceneId: "s", itemUuid: "Item.poi", name: "Local" });
  await app.refresh();
  const prepare = () => (app as unknown as { _prepareContext(): Promise<InvestigationRenderContext> })._prepareContext();
  const button = { disabled: false, isConnected: true, setAttribute: vi.fn(), removeAttribute: vi.fn() };
  const target = { dataset: { itemId: "tool" }, closest: () => button } as unknown as HTMLElement;
  const use = () => InvestigationApplication.DEFAULT_OPTIONS.actions.useTool.call(app, {} as PointerEvent, target);
  const handlebars = Handlebars.create();
  handlebars.registerHelper("localize", localize);
  const render = handlebars.compile(await readFile(new URL("../../../templates/points-of-interest/investigation-application.hbs", import.meta.url), "utf8"));
  return { app, prepare, use, render, equipment, dispatch, notifications, information, discoveries, actor, button };
}

it.each([
  [0, "Nenhuma informação nova foi descoberta."],
  [1, "1 nova informação descoberta."],
  [3, "3 novas informações descobertas."],
] as const)("presents %i authoritative new Informations in the existing status", async (newCount, message) => {
  const f = await fixture({ status: "success", newCount, manual: newCount === 0 });
  await f.use();
  const context = await f.prepare();
  expect(context.feedback).toBe(message);
  expect(f.render(context)).toContain(`<p class="op2-investigation-feedback" role="status">${message}</p>`);
  // The count comes from the execution response even when the projection is unchanged.
  expect(context.discoveries).toEqual([]);
  expect(f.dispatch).toHaveBeenCalledWith("ordemparanormal2.usePoiTool", expect.objectContaining({
    actorUuid: f.actor.uuid, equipmentId: "tool", useFormId: "scan",
    context: { sceneId: "s", itemUuid: "Item.poi", runId: "run" },
  }), { timeout: 10000 });
  expect(f.notifications.warn).not.toHaveBeenCalled();
  expect(f.notifications.info).not.toHaveBeenCalled();
  expect(f.notifications.error).not.toHaveBeenCalled();
  expect(f.button.disabled).toBe(false);
  expect(f.button.removeAttribute).toHaveBeenCalledWith("aria-busy");
});

it("refreshes the status, skill table, DESCOBERTAS and remaining uses together after completion", async () => {
  const f = await fixture();
  f.dispatch.mockImplementationOnce(async () => {
    f.equipment.system.uses.value = 2;
    f.information.push({ content: "Marcas recentes.", visibility: "public", difficulty: 6 });
    f.discoveries.push({ content: "A temperatura está baixa." });
    return { status: "success", newCount: 2, manual: false };
  });
  await f.use();
  const context = await f.prepare();
  expect(state.projection).toHaveBeenCalledTimes(2);
  expect(context.isPlayer && context.skills[0].rows[0].content).toBe("Marcas recentes.");
  expect(context.discoveries).toEqual([{ content: "A temperatura está baixa." }]);
  expect(context.tools?.[0].uses).toEqual({ value: 2, max: 5 });
  const html = f.render(context);
  expect(html).toContain('role="status">2 novas informações descobertas.</p>');
  expect(html).toContain("Marcas recentes.");
  expect(html).toContain(">DESCOBERTAS<");
  expect(html).toContain("A temperatura está baixa.");
  expect(html).toContain("2 / 5");
  expect(html).not.toContain("3 / 5");
  await f.app.refresh();
  expect((await f.prepare()).feedback).toBe("2 novas informações descobertas.");
});

it("cancels form selection without dispatch, resource change, discoveries or success feedback", async () => {
  const f = await fixture();
  f.equipment.system.useForms.push({ id: "other", name: "Outra", description: "", consumesUse: false });
  state.select.mockResolvedValue(null);
  await f.use();
  const context = await f.prepare();
  expect(state.select).toHaveBeenCalledOnce();
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(f.equipment.system.uses.value).toBe(3);
  expect(context.discoveries).toEqual([]);
  expect(context.feedback).toBe("");
  expect(f.render(context)).not.toContain('role="status"');
  expect(f.notifications.warn).not.toHaveBeenCalled();
  expect(f.notifications.info).not.toHaveBeenCalled();
});

it.each(["insufficient", "forbidden", "invalid", "uncertain"] as const)(
  "preserves the appropriate %s error instead of a zero-discovery success", async status => {
    const f = await fixture({ status });
    await f.use();
    const context = await f.prepare();
    expect(context.feedback).toBe(messages[status]);
    expect(context.feedback).not.toContain("Nenhuma informação nova");
    expect(f.equipment.system.uses.value).toBe(3);
    expect(f.notifications.warn).toHaveBeenCalledWith(messages[status]);
    expect(f.notifications.info).not.toHaveBeenCalled();
  });

it.each(["publication", "discovery"] as const)("keeps a partial %s failure after consumption distinct from success", async stage => {
  const f = await fixture();
  f.dispatch.mockImplementationOnce(async () => {
    f.equipment.system.uses.value = 2;
    return { status: "partial", stage };
  });
  await f.use();
  const context = await f.prepare();
  const message = stage === "publication" ? messages.PublicationFailed : messages.DiscoveryFailed;
  expect(context.feedback).toBe(message);
  expect(f.render(context)).toContain(`role="status">${message}</p>`);
  expect(context.feedback).not.toContain("Nenhuma informação nova");
  expect(context.tools?.[0].uses?.value).toBe(2);
  expect(f.notifications.warn).toHaveBeenCalledWith(message);
  expect(f.notifications.info).not.toHaveBeenCalled();
});

it("leaves Inventory use without POI context or Investigation discovery feedback", async () => {
  const f = await fixture({ status: "success", newCount: 0, manual: false });
  const { useEquipment, equipmentUseFeedback } = await import("../../features/equipment/use-equipment");
  const result = await useEquipment(f.actor, "tool");
  const [, intent] = f.dispatch.mock.calls[0] as unknown as [string, Record<string, unknown>];
  expect(intent).not.toHaveProperty("context");
  expect(equipmentUseFeedback(result)).toBe(messages.Completed);
  expect((await f.prepare()).feedback).toBe("");
});
