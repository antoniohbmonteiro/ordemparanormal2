import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPoiItemDirectoryPreviews } from "./register-poi-item-directory-previews";

const thumbnail = vi.fn();
let caseId = 0;
class Item {
  readonly #source: { id: string; name: string; img: string; type: string };
  constructor(id: string, type = "pointOfInterest", img = `worlds/test/directory-${caseId}/${id}.jpg`) {
    this.#source = { id, name: `Name ${id}`, img, type };
  }
  get id() { return this.#source.id; }
  get name() { return this.#source.name; }
  get img() { return this.#source.img; }
  get type() { return this.#source.type; }
  get thumbnail() { return this.#source.img; }
  changeImage(img: string) { this.#source.img = img; }
  toObject() { return { ...this.#source }; }
}
interface Tree { root: boolean; folder: { id: string; expanded: boolean } | null; entries: Item[]; children: Tree[] }
let tree: Tree;
class NativeDirectory {
  static DEFAULT_OPTIONS = { actions: { native: true }, classes: ["native-directory"] };
  async _prepareDirectoryContext(context: { tree?: unknown; entryPartial?: string; native?: boolean }) {
    Object.assign(context, { tree, entryPartial: "native-entry", native: true });
  }
  nativeControls() { return ["create", "folder", "search", "sort", "permissions", "drag-drop", "popout"]; }
}
let config: { ui: { items: typeof NativeDirectory } };
beforeEach(() => {
  caseId++; thumbnail.mockReset().mockImplementation(async (src: string) => ({ thumb: `data:image/webp;base64,${src}` }));
  tree = { root: true, folder: null, entries: [new Item("root-poi"), new Item("equipment", "equipment")],
    children: [{ root: false, folder: { id: "act", expanded: true }, entries: [], children: [
      { root: false, folder: { id: "pois", expanded: false }, entries: [new Item("nested-poi")], children: [] },
    ] }] };
  config = { ui: { items: NativeDirectory } };
  vi.stubGlobal("CONFIG", config);
  vi.stubGlobal("foundry", { helpers: { media: { ImageHelper: { createThumbnail: thumbnail } } } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function prepare() {
  registerPoiItemDirectoryPreviews();
  const app = new config.ui.items();
  const context: { tree?: unknown; native?: boolean; entryPartial?: string } = {};
  await app._prepareDirectoryContext(context);
  return { app, context: context as { tree: Tree; native: boolean; entryPartial: string } };
}
describe("Foundry Item directory POI previews", () => {
  it("changes only POI thumbnail presentation through the native preparation method", async () => {
    const before = JSON.stringify(tree); const { app, context } = await prepare();
    expect(context.native).toBe(true); expect(context.entryPartial).toBe("native-entry");
    expect(app.nativeControls()).toEqual(["create", "folder", "search", "sort", "permissions", "drag-drop", "popout"]);
    expect(config.ui.items.DEFAULT_OPTIONS).toBe(NativeDirectory.DEFAULT_OPTIONS);
    expect(context.tree.entries[0].thumbnail).toBe(`data:image/webp;base64,${tree.entries[0].img}`);
    const nested = context.tree.children[0].children[0];
    expect(nested.entries[0].thumbnail).toBe(`data:image/webp;base64,${tree.children[0].children[0].entries[0].img}`);
    expect(nested.folder).toBe(tree.children[0].children[0].folder);
    expect(nested.folder?.expanded).toBe(false);
    expect(context.tree.entries[1]).toBe(tree.entries[1]);
    expect(context.tree.entries[0].id).toBe("root-poi"); expect(context.tree.entries[0].name).toBe("Name root-poi");
    expect(context.tree.entries[0].constructor).toBe(Item);
    expect(context.tree.entries[0].toObject()).toEqual(tree.entries[0].toObject());
    expect(JSON.stringify(tree)).toBe(before);
    expect(tree.entries[0].thumbnail).toBe(tree.entries[0].img);
    expect(thumbnail).toHaveBeenCalledTimes(2);
  });
  it("wraps an already configured extension once and shares cached thumbnails on subsequent directory renders", async () => {
    class Extended extends NativeDirectory { override nativeControls() { return [...super.nativeControls(), "module-button"]; } }
    config.ui.items = Extended;
    const first = await prepare(); const Constructor = config.ui.items;
    const second = await prepare();
    expect(config.ui.items).toBe(Constructor); expect(first.app).toBeInstanceOf(Extended);
    expect(second.app.nativeControls()).toContain("module-button");
    expect(thumbnail).toHaveBeenCalledTimes(2);
  });
  it("retains the original document and directory controls when thumbnail generation fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    thumbnail.mockRejectedValue(new Error("thumbnail"));
    const { context } = await prepare();
    expect(context.tree.entries[0]).toBe(tree.entries[0]);
    expect(context.tree.entries[0].thumbnail).toBe(tree.entries[0].img);
    expect(context.native).toBe(true);
  });
  it("uses a fresh cache key when an Item image changes", async () => {
    await prepare(); const next = `worlds/test/directory-${caseId}/changed.webp`;
    tree.entries[0].changeImage(next);
    expect((await prepare()).context.tree.entries[0].thumbnail).toBe(`data:image/webp;base64,${next}`);
    expect(thumbnail).toHaveBeenCalledTimes(3);
  });
  it("keeps native context untouched if a future or third-party directory uses a different tree shape", async () => {
    class Extended extends NativeDirectory {
      override async _prepareDirectoryContext(context: object) { Object.assign(context, { tree: { custom: true }, native: true }); }
    }
    config.ui.items = Extended;
    expect((await prepare()).context.tree).toEqual({ custom: true }); expect(thumbnail).not.toHaveBeenCalled();
  });
});
