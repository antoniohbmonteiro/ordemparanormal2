import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openPoiPicker, filterPoiEntries } from "./poi-picker";
import { PoiTestElement, poiTestDocument, flushPoiTasks } from "./poi-dom-test-fixture";

const { load, resolve } = vi.hoisted(() => ({ load: vi.fn(), resolve: vi.fn() }));
vi.mock("../../adapters/foundry/points-of-interest/poi-catalog", () => ({ loadAvailablePois: load, resolvePoiCatalogSource: resolve }));
const entries = [{ key: "world:a", uuid: "Item.a", name: "Biblioteca", img: "", origin: "Mundo", source: { kind: "world" as const, documentId: "a" } },
  { key: "pack:b", uuid: "Compendium.world.poi.Item.b", name: "Porão", img: "", origin: "Coleção", source: { kind: "compendium" as const, packId: "world.poi", documentId: "b" } }];
class DialogStub extends EventTarget {
  static latest: DialogStub;
  window = { content: new PoiTestElement() };
  constructor(readonly options: { content: PoiTestElement; buttons: unknown[] }) {
    super(); DialogStub.latest = this;
    // Foundry serializes content, so listeners on the supplied elements do not survive.
    const mount = new PoiTestElement(); mount.className = "op2-poi-picker-mount";
    this.window.content.append(mount);
  }
  async render(): Promise<void> { this.dispatchEvent(new Event("render")); }
  close = vi.fn(async () => { this.dispatchEvent(new Event("close")); });
}
function element(tag: string): PoiTestElement { return DialogStub.latest.window.content.find(el => el.tagName === tag)!; }
function button(key: string): PoiTestElement { return DialogStub.latest.window.content.find(el => el.tagName === "button" && el.textContent.endsWith(`.${key}`))!; }
beforeEach(() => {
  load.mockReset().mockResolvedValue(entries); resolve.mockReset().mockResolvedValue({ itemUuid: "Item.a", name: "Biblioteca", origin: "Mundo" });
  vi.stubGlobal("document", poiTestDocument); vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { applications: { api: { DialogV2: DialogStub } } });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Actor-independent POI picker", () => {
  it("searches by name or origin case-insensitively", () => {
    expect(filterPoiEntries(entries, " BIBLIO ")).toEqual([entries[0]]);
    expect(filterPoiEntries(entries, "COLEÇÃO")).toEqual([entries[1]]);
    expect(filterPoiEntries(entries, "missing")).toEqual([]);
  });
  it("requires explicit selection and confirmation, then revalidates the canonical source", async () => {
    const picker = openPoiPicker(); await flushPoiTasks();
    expect(DialogStub.latest.options.content.className).toBe("");
    expect(button("Choose").disabled).toBe(true); expect(resolve).not.toHaveBeenCalled();
    const select = element("select"); expect(select.children).toHaveLength(2);
    select.value = entries[0].key; select.dispatchEvent(new Event("change")); button("Choose").click();
    expect(await picker.result).toEqual({ itemUuid: "Item.a", name: "Biblioteca", origin: "Mundo" });
    expect(resolve).toHaveBeenCalledExactlyOnceWith(entries[0].source); expect(DialogStub.latest.close).toHaveBeenCalledOnce();
  });
  it("reports loading failures and supports retry", async () => {
    load.mockRejectedValueOnce(new Error("offline")); const picker = openPoiPicker(); await flushPoiTasks();
    expect(element("p").textContent).toMatch(/LoadFailed$/); expect(button("Retry").hidden).toBe(false);
    button("Retry").click(); await flushPoiTasks(); expect(element("select").children).toHaveLength(2);
    await picker.close(); expect(await picker.result).toBeNull();
  });
  it("reports empty catalogs and disappeared selections without accepting them", async () => {
    load.mockResolvedValueOnce([]); const empty = openPoiPicker(); await flushPoiTasks();
    expect(element("p").textContent).toMatch(/Empty$/); await empty.close();
    resolve.mockRejectedValueOnce(new Error("deleted")); const picker = openPoiPicker(); await flushPoiTasks();
    element("select").value = entries[0].key; element("select").dispatchEvent(new Event("change")); button("Choose").click(); await flushPoiTasks();
    expect(element("p").textContent).toMatch(/Unavailable$/); expect(button("Retry").hidden).toBe(false);
    await picker.close(); expect(await picker.result).toBeNull();
  });
  it("ignores a late resolution when its owner closes it", async () => {
    let finish!: (value: unknown) => void;
    resolve.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const picker = openPoiPicker(); await flushPoiTasks();
    element("select").value = entries[0].key; element("select").dispatchEvent(new Event("change")); button("Choose").click();
    await picker.close(); finish({ itemUuid: "Item.late" }); await flushPoiTasks();
    expect(await picker.result).toBeNull();
  });
});
