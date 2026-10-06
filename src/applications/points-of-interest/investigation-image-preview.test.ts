import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoiInvestigationResult } from "../../adapters/foundry/points-of-interest/resolve-poi-investigation-view";
import type { InvestigationRenderContext } from "./investigation-application";

const state = vi.hoisted(() => ({ query: vi.fn(), thumbnail: vi.fn(), popout: vi.fn(), popoutRender: vi.fn(),
  update: vi.fn(), setFlag: vi.fn(), upload: vi.fn() }));
vi.mock("../../adapters/foundry/points-of-interest/resolve-investigation-agent", () => ({ resolveSceneInvestigationAgent: () => null }));
vi.mock("../../adapters/foundry/points-of-interest/poi-investigation-query", () => ({ requestPoiInvestigationView: state.query }));

class NativeApplication {
  render = vi.fn(async () => undefined);
  _onClose() {}
}
class NativePopout {
  constructor(options: object) { state.popout(options); }
  render = state.popoutRender;
}
const native = { applications: { api: { ApplicationV2: NativeApplication, HandlebarsApplicationMixin: (base: unknown) => base },
  apps: { ImagePopout: NativePopout, FilePicker: { upload: state.upload } } },
  helpers: { media: { ImageHelper: { createThumbnail: state.thumbnail } } } };

function projection(img: string, audience: "gm" | "player" = "gm"): PoiInvestigationResult {
  const common = { img, name: "POI", description: "", skills: [] };
  return audience === "gm" ? { view: { ...common, audience, itemUuid: "Item.poi", gmContext: "" } }
    : { view: { ...common, audience } };
}
interface TestApplication {
  refresh(): Promise<void>;
  _prepareContext(): Promise<InvestigationRenderContext & { previewImg: string }>;
  _onClose(options: object): void;
}
let Application: typeof import("./investigation-application")["InvestigationApplication"];
let template: Handlebars.TemplateDelegate;
let source = "";
let caseId = 0;
beforeAll(async () => {
  vi.stubGlobal("foundry", native);
  Application = (await import("./investigation-application")).InvestigationApplication;
  template = Handlebars.compile(await readFile(new URL("../../../templates/points-of-interest/investigation-application.hbs", import.meta.url), "utf8"));
  Handlebars.registerHelper("localize", (key: string) => key);
});
beforeEach(() => {
  vi.clearAllMocks();
  source = `worlds/test/preview-case-${++caseId}.jpg`;
  state.query.mockReset().mockResolvedValue(projection(source));
  state.thumbnail.mockReset().mockResolvedValue({ thumb: "data:image/webp;base64,thumbnail" });
  state.popoutRender.mockResolvedValue(undefined);
  vi.stubGlobal("foundry", native);
  vi.stubGlobal("game", { user: { isGM: true }, i18n: { localize: (key: string) => key },
    items: { get: () => ({ img: source, flags: {}, update: state.update, setFlag: state.setFlag }) } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function application(): Promise<TestApplication> {
  const app = new Application({ sceneId: "scene", itemUuid: "Item.poi", name: "POI" }) as unknown as TestApplication;
  await app.refresh(); return app;
}
async function enlarge(app: TestApplication): Promise<void> {
  const action = Application.DEFAULT_OPTIONS.actions.enlargeImage as unknown as (this: TestApplication) => Promise<void>;
  await action.call(app);
}

describe("Investigation image presentation", () => {
  it.each(["gm", "player"] as const)("uses a thumbnail only in the %s preview and opens the original without persistence", async audience => {
    vi.stubGlobal("game", { user: { isGM: audience === "gm" }, i18n: { localize: (key: string) => key },
      items: { get: () => ({ img: source, flags: {}, update: state.update, setFlag: state.setFlag }) } });
    state.query.mockResolvedValue(projection(source, audience));
    const app = await application(); const context = await app._prepareContext();
    expect(context.img).toBe(source);
    expect(context.previewImg).toBe("data:image/webp;base64,thumbnail");
    expect(state.thumbnail).toHaveBeenCalledExactlyOnceWith(source, { width: 480, height: 360, format: "image/webp", quality: 0.85 });
    expect(template(context)).toContain('data-poi-image data-action="enlargeImage" src="data:image/webp;base64,thumbnail"');
    await enlarge(app);
    expect(state.popout).toHaveBeenCalledExactlyOnceWith({ src: source, window: { title: "POI" } });
    expect(state.popoutRender).toHaveBeenCalledWith({ force: true });
    expect(state.update).not.toHaveBeenCalled(); expect(state.setFlag).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
  });
  it("reuses a successful preview across rerenders and closed/reopened Investigation windows", async () => {
    const app = await application();
    await app._prepareContext(); await app._prepareContext(); await app.refresh(); await app._prepareContext();
    app._onClose({}); const reopened = await application();
    expect((await reopened._prepareContext()).previewImg).toBe("data:image/webp;base64,thumbnail");
    expect(state.thumbnail).toHaveBeenCalledOnce();
  });
  it("shares generation in progress between concurrent render contexts", async () => {
    let finish!: (value: { thumb: string }) => void;
    state.thumbnail.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const app = await application();
    const first = app._prepareContext(), second = app._prepareContext();
    await Promise.resolve(); expect(state.thumbnail).toHaveBeenCalledOnce();
    finish({ thumb: "data:image/webp;base64,shared" });
    expect((await Promise.all([first, second])).map(context => context.previewImg)).toEqual([
      "data:image/webp;base64,shared", "data:image/webp;base64,shared",
    ]);
  });
  it("falls back without warning spam or a permanently failed cache and retries later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.thumbnail.mockRejectedValueOnce(new Error("thumbnail unavailable"));
    const app = await application();
    expect((await app._prepareContext()).previewImg).toBe(source);
    expect((await app._prepareContext()).previewImg).toBe(source);
    await enlarge(app); expect(state.popout).toHaveBeenCalledWith({ src: source, window: { title: "POI" } });
    expect(warn).toHaveBeenCalledOnce(); expect(state.thumbnail).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.now() + 30_001);
    expect((await app._prepareContext()).previewImg).toBe("data:image/webp;base64,thumbnail");
    expect(state.thumbnail).toHaveBeenCalledTimes(2);
  });
  it.each([null, {}, { thumb: "" }])("falls back when the public helper returns no thumbnail: %j", async result => {
    vi.spyOn(console, "warn").mockImplementation(() => {}); state.thumbnail.mockResolvedValueOnce(result);
    expect((await (await application())._prepareContext()).previewImg).toBe(source);
  });
  it("creates a new preview when the canonical image changes", async () => {
    const app = await application(); await app._prepareContext();
    const next = `${source}.new.webp`;
    state.query.mockResolvedValue(projection(next)); state.thumbnail.mockResolvedValue({ thumb: "data:image/webp;base64,new" });
    await app.refresh(); const context = await app._prepareContext();
    expect(context).toMatchObject({ img: next, previewImg: "data:image/webp;base64,new" });
    expect(state.thumbnail.mock.calls.map(([src]) => src)).toEqual([source, next]);
    await enlarge(app); expect(state.popout).toHaveBeenLastCalledWith({ src: next, window: { title: "POI" } });
  });
  it("does not request a thumbnail while loading or when there is no image", async () => {
    const app = new Application({ sceneId: "scene", itemUuid: "Item.poi", name: "POI" }) as unknown as TestApplication;
    expect(await app._prepareContext()).toMatchObject({ isReady: false, previewImg: "" });
    state.query.mockResolvedValue(projection("")); await app.refresh();
    expect(await app._prepareContext()).toMatchObject({ isReady: true, previewImg: "" });
    expect(state.thumbnail).not.toHaveBeenCalled();
  });
  it("does not render stale image/content when the projection changes during generation", async () => {
    let finish!: (value: { thumb: string }) => void;
    state.thumbnail.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const app = await application(); const pending = app._prepareContext(); await Promise.resolve();
    state.query.mockResolvedValue(projection(`${source}.updated`)); await app.refresh();
    finish({ thumb: "data:image/webp;base64,old" });
    expect(await pending).toMatchObject({ isReady: false, img: "", previewImg: "" });
    expect((await app._prepareContext()).img).toBe(`${source}.updated`);
  });
});
