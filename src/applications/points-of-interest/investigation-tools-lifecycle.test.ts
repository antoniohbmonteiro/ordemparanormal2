import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ actor: null as foundry.documents.Actor | null, query: vi.fn(), stop: vi.fn() }));
vi.mock("../../adapters/foundry/points-of-interest/resolve-investigation-agent", () => ({
  resolveSceneInvestigationAgent: () => state.actor,
}));
vi.mock("../../adapters/foundry/points-of-interest/poi-investigation-query", () => ({ requestPoiInvestigationView: state.query }));
vi.mock("../../adapters/foundry/points-of-interest/poi-runtime-queries", () => ({
  mutatePoi: vi.fn(), subscribePoiInvalidation: () => state.stop,
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("discards previous Agent responses, refreshes Item changes and releases native/client listeners on close", async () => {
  class Application {
    static DEFAULT_OPTIONS = {};
    render = vi.fn(async () => undefined);
    async _onFirstRender() {}
    _onClose() {}
  }
  vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base: unknown) => base } } });
  const hooks = new Map<number, { name: string; handler: (...args: unknown[]) => void }>();
  let id = 0;
  vi.stubGlobal("Hooks", { on: (name: string, handler: (...args: unknown[]) => void) => {
    hooks.set(++id, { name, handler }); return id;
  }, off: (_name: string, hookId: number) => { hooks.delete(hookId); } });
  vi.stubGlobal("game", { user: { isGM: false }, users: { activeGM: null },
    i18n: { localize: (key: string) => key } });
  const actor = (uuid: string) => ({ uuid, name: uuid, isOwner: true, items: [
    { id: uuid, type: "equipment", name: uuid, sort: 0, system: { category: "tool", useForms: [] } },
  ], getEmbeddedDocument: () => null }) as unknown as foundry.documents.Actor;
  const a = actor("Actor.a"), b = actor("Actor.b");
  state.actor = a;
  let finish!: (value: unknown) => void;
  state.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = (content: string) => ({ view: { audience: "player", name: "POI", description: "", img: "",
    skills: [], tools: [], discoveries: [{ content }] } });
  state.query.mockResolvedValue(view("B conhecida"));
  const { InvestigationApplication } = await import("./investigation-application");
  const application = new InvestigationApplication({ sceneId: "s", itemUuid: "Item.poi", name: "POI" });
  const app = application as unknown as { render: ReturnType<typeof vi.fn>;
    _onFirstRender(context: object, options: object): Promise<void>;
    _prepareContext(): Promise<{ tools: { id: string }[]; discoveries: { content: string }[] }>;
    _onClose(options: object): void };
  await app._onFirstRender({}, {});
  expect(state.query.mock.calls[0][0]).toMatchObject({ actorUuid: "Actor.a" });
  state.actor = b;
  hooks.values().find(hook => hook.name === "controlToken")!.handler();
  await vi.waitFor(() => expect(state.query).toHaveBeenCalledTimes(2));
  finish(view("A privada"));
  await Promise.resolve();
  const context = await app._prepareContext();
  expect(context.tools.map(tool => tool.id)).toEqual(["Actor.b"]);
  expect(context.discoveries).toEqual([{ content: "B conhecida" }]);
  (b.items as unknown as unknown[]).length = 0;
  hooks.values().find(hook => hook.name === "deleteItem")!.handler({ actor: b });
  await vi.waitFor(() => expect(state.query).toHaveBeenCalledTimes(3));
  expect((await app._prepareContext()).tools).toEqual([]);
  app._onClose({});
  expect(hooks.size).toBe(0);
  expect(state.stop).toHaveBeenCalledOnce();
  app.render.mockClear();
  const { useEquipment } = await import("../../features/equipment/use-equipment");
  await useEquipment(b, "missing");
  expect(app.render).not.toHaveBeenCalled();
});
