import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormDataExtended } from "@client/applications/ux/_module.mjs";
import { resolvePoiImagePreview } from "../../adapters/foundry/points-of-interest/poi-image-preview";

const thumbnail = vi.fn(); const update = vi.fn();
let source = "", caseId = 0;
interface TestItem { name: string; img: string; uuid: string; system: { information: unknown[] }; update: typeof update }
class NativeSheet {
  isEditable = true;
  constructor(readonly document: TestItem) {}
  async _prepareContext() { return { editable: this.isEditable }; }
  _processFormData(_event: unknown, _form: unknown, data: { object: object }) { return structuredClone(data.object); }
}
const native = { applications: { api: { HandlebarsApplicationMixin: (base: unknown) => base },
  ux: { TextEditor: { implementation: { enrichHTML: async (text: string) => text } } }, sheets: { ItemSheetV2: NativeSheet } },
  helpers: { media: { ImageHelper: { createThumbnail: thumbnail } } } };
let Sheet: typeof import("./point-of-interest-item-sheet")["PointOfInterestItemSheet"];
let template: Handlebars.TemplateDelegate;
beforeAll(async () => {
  vi.stubGlobal("foundry", native);
  Sheet = (await import("./point-of-interest-item-sheet")).PointOfInterestItemSheet;
  template = Handlebars.compile(await readFile(new URL("../../../templates/item/point-of-interest-item-sheet.hbs", import.meta.url), "utf8"));
  Handlebars.registerHelper("localize", (key: string) => key);
});
beforeEach(() => {
  caseId++; source = `worlds/test/sheet-preview-${caseId}.jpg`;
  thumbnail.mockReset().mockResolvedValue({ thumb: "data:image/webp;base64,poi-sheet" }); update.mockClear();
  vi.stubGlobal("foundry", native); vi.stubGlobal("game", { user: { isGM: true } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function sheet() {
  const item = { name: "POI", img: source, uuid: "Item.poi", system: { information: [] }, update };
  const app = new Sheet({ document: item } as never) as unknown as {
    isEditable: boolean;
    _prepareContext(options: object): Promise<{ canViewAuthoring: boolean; poi?: { img: string; previewImg: string } }>;
    _processFormData(event: null, form: HTMLFormElement, data: FormDataExtended): Record<string, unknown>;
  };
  // NativeSheet is only the Document-bound test boundary, not a real Foundry constructor.
  Object.defineProperty(app, "document", { value: item });
  return { app, item };
}
describe("POI authoring sheet previews", () => {
  it("renders the shared thumbnail while keeping the canonical image and native edit binding", async () => {
    const { app, item } = sheet(); const context = await app._prepareContext({});
    expect(context.poi).toMatchObject({ img: source, previewImg: "data:image/webp;base64,poi-sheet" });
    expect(template(context)).toContain('src="data:image/webp;base64,poi-sheet"');
    expect(template(context)).toContain('data-edit="img"'); expect(template(context)).toContain('data-action="editImage"');
    expect(await resolvePoiImagePreview(source)).toBe(context.poi?.previewImg);
    expect(thumbnail).toHaveBeenCalledOnce(); expect(item.img).toBe(source); expect(update).not.toHaveBeenCalled();
  });
  it("filters a derived src out of native form submissions but permits an explicitly selected new image", async () => {
    const { app, item } = sheet(); const context = await app._prepareContext({});
    const submit = (img: string) => app._processFormData(null, {} as HTMLFormElement,
      { object: { name: "Edited", img } } as unknown as FormDataExtended);
    expect(submit(context.poi!.previewImg)).toEqual({ name: "Edited" });
    expect(submit("worlds/test/new-original.webp")).toEqual({ name: "Edited", img: "worlds/test/new-original.webp" });
    expect(item.img).toBe(source); expect(update).not.toHaveBeenCalled();
  });
  it("uses the original on failure and prevents it from becoming an incidental image update", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {}); thumbnail.mockRejectedValueOnce(new Error("thumbnail"));
    const { app, item } = sheet(); const context = await app._prepareContext({});
    expect(context.poi).toMatchObject({ img: source, previewImg: source });
    expect(app._processFormData(null, {} as HTMLFormElement,
      { object: { img: source, name: "Edited" } } as unknown as FormDataExtended)).toEqual({ name: "Edited" });
    expect(item.img).toBe(source);
  });
  it("uses a new thumbnail after a canonical image change", async () => {
    const { app, item } = sheet(); await app._prepareContext({});
    item.img = `${source}.new.webp`; thumbnail.mockResolvedValue({ thumb: "data:image/webp;base64,new" });
    expect((await app._prepareContext({})).poi).toMatchObject({ img: item.img, previewImg: "data:image/webp;base64,new" });
    expect(thumbnail).toHaveBeenCalledTimes(2);
  });
  it("does not generate or expose authoring previews to non-GMs", async () => {
    vi.stubGlobal("game", { user: { isGM: false } }); const { app } = sheet();
    expect(await app._prepareContext({})).toMatchObject({ canViewAuthoring: false, editable: false });
    expect(thumbnail).not.toHaveBeenCalled();
  });
});
