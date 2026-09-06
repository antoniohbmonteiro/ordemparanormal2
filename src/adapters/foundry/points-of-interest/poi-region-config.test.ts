import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PoiTestElement, poiTestDocument, flushPoiTasks } from "../../../applications/points-of-interest/poi-dom-test-fixture";
import { renderPoiRegionConfig } from "./poi-region-config";
import { POI_REGION_FLAG_PATH } from "./poi-region-association";

const { open, resolve } = vi.hoisted(() => ({ open: vi.fn(), resolve: vi.fn() }));
vi.mock("../../../applications/points-of-interest/poi-picker", () => ({ openPoiPicker: open }));
vi.mock("./poi-catalog", () => ({ resolvePoiAssociation: resolve }));
class FormDataStub {
  values: Record<string, unknown> = {};
  set(path: string, value: unknown): void { this.values[path] = value; }
}
class Deletion {}
function fixture(raw?: unknown) {
  const app = Object.assign(new EventTarget(), {
    document: { id: "region", documentName: "Region", parent: { id: "scene", regions: { get: (): unknown => undefined } },
      getFlag: vi.fn(() => raw), update: vi.fn(), setFlag: vi.fn(), unsetFlag: vi.fn() },
    isEditable: true, form: new PoiTestElement("form"), window: { content: new PoiTestElement() },
  });
  app.document.parent.regions.get = () => app.document;
  const button = (label: string) => app.window.content.find(el => el.tagName === "button" && el.textContent.endsWith(`.${label}`))!;
  const data = (formData: unknown = new FormDataStub()) => {
    app.form.dispatchEvent(Object.assign(new Event("formdata"), { formData }));
    return (formData as FormDataStub).values;
  };
  return { app, button, data };
}
beforeEach(() => {
  open.mockReset(); resolve.mockReset().mockResolvedValue(null);
  vi.stubGlobal("document", poiTestDocument);
  vi.stubGlobal("game", { user: { isGM: true }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { applications: { ux: { FormDataExtended: FormDataStub } },
    data: { operators: { ForcedDeletion: Deletion, ForcedReplacement: { create: (value: unknown) => ({ replacement: value }) } } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("POI RegionConfig draft", () => {
  it("registers scoped styles and the localized section and picker labels", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../../system.json", import.meta.url), "utf8"));
    const language = JSON.parse(readFileSync(new URL("../../../../lang/pt-BR.json", import.meta.url), "utf8"));
    const css = readFileSync(new URL("../../../../styles/poi-region-config.css", import.meta.url), "utf8");
    expect(manifest.styles).toContain("styles/poi-region-config.css");
    expect(language.ORDEMPARANORMAL2.PointOfInterest.RegionConfig.Title).toBe("Ponto de Interesse");
    expect(language.ORDEMPARANORMAL2.PointOfInterest.Picker.Choose).toBe("Usar este POI");
    expect([...css.matchAll(/([^{}]+)\{/g)].every(match => match[1].trim().startsWith(".op2-poi-"))).toBe(true);
  });
  it("opening never writes, and an unchanged draft adds nothing to native form data", () => {
    const { app, data } = fixture({ itemUuid: "Item.old" }); renderPoiRegionConfig(app);
    expect(data()).toEqual({}); expect(app.document.update).not.toHaveBeenCalled();
    expect(app.document.setFlag).not.toHaveBeenCalled(); expect(app.document.unsetFlag).not.toHaveBeenCalled();
  });
  it("choosing and removing are local and affect only the native submission fragment", async () => {
    const { app, button, data } = fixture({ itemUuid: "Item.old" });
    open.mockReturnValue({ result: Promise.resolve({ itemUuid: "Item.new", name: "New", origin: "Mundo" }), close: vi.fn() });
    renderPoiRegionConfig(app); button("Choose").click(); await flushPoiTasks();
    expect(data()).toEqual({ [POI_REGION_FLAG_PATH]: { replacement: { itemUuid: "Item.new", name: "New" } } });
    button("Remove").click(); expect(data()).toEqual({ [POI_REGION_FLAG_PATH]: expect.any(Deletion) });
    expect(app.document.update).not.toHaveBeenCalled();
    expect(app.document.getFlag()).toEqual({ itemUuid: "Item.old" });
  });
  it("rerenders preserve pending changes and replace only our section and form listener", () => {
    const { app, button, data } = fixture({ itemUuid: "Item.old" });
    const native = new PoiTestElement(); app.window.content.append(native);
    renderPoiRegionConfig(app); button("Remove").click(); renderPoiRegionConfig(app);
    expect(app.window.content.children).toHaveLength(2); expect(app.window.content.children).toContain(native);
    const old = app.form; app.form = new PoiTestElement("form"); renderPoiRegionConfig(app);
    const stale = new FormDataStub(); old.dispatchEvent(Object.assign(new Event("formdata"), { formData: stale }));
    expect(stale.values).toEqual({}); expect(data()).toEqual({ [POI_REGION_FLAG_PATH]: expect.any(Deletion) });
    const set = vi.fn(); data({ set }); expect(set).not.toHaveBeenCalled();
  });
  it("canceling the picker preserves a pending draft; closing the sheet discards it", async () => {
    const { app, button, data } = fixture({ itemUuid: "Item.old" });
    open.mockReturnValue({ result: Promise.resolve(null), close: vi.fn() });
    renderPoiRegionConfig(app); button("Remove").click(); button("Choose").click(); await flushPoiTasks();
    expect(data()).toEqual({ [POI_REGION_FLAG_PATH]: expect.any(Deletion) });
    app.dispatchEvent(new Event("close")); expect(data()).toEqual({});
    renderPoiRegionConfig(app); expect(data()).toEqual({});
  });
  it("closes its picker and ignores late results after sheet closure", async () => {
    let finish!: (value: unknown) => void; const close = vi.fn();
    open.mockReturnValue({ result: new Promise(resolve => { finish = resolve; }), close });
    const { app, button, data } = fixture(); renderPoiRegionConfig(app); button("Choose").click();
    app.dispatchEvent(new Event("close")); finish({ itemUuid: "Item.late" }); await flushPoiTasks();
    expect(close).toHaveBeenCalledOnce(); expect(app.window.content.children).toHaveLength(0); expect(data()).toEqual({});
  });
  it("excludes players, previews, palettes and noneditable sheets", () => {
    for (const modify of [
      (app: ReturnType<typeof fixture>["app"]) => { app.isEditable = false; },
      (app: ReturnType<typeof fixture>["app"]) => { app.document.parent.regions.get = () => ({ ...app.document }); },
      (app: ReturnType<typeof fixture>["app"]) => { app.document.id = ""; },
    ]) { const { app } = fixture(); modify(app); renderPoiRegionConfig(app); expect(app.window.content.children).toHaveLength(0); }
    vi.stubGlobal("game", { user: { isGM: false } }); const { app } = fixture();
    renderPoiRegionConfig(app); expect(app.window.content.children).toHaveLength(0);
  });
});
