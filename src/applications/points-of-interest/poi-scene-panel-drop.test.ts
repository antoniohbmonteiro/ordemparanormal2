import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyPoiSceneDrop, listenPoiScenePanelDrop } from "./poi-scene-panel-drop";

const item = (uuid: string, type = "pointOfInterest") => ({
  uuid, type, isEmbedded: false, pack: null, ownership: { default: 0 },
  testUserPermission: () => false,
});
const items = new Map([
  ["poi", item("Item.poi")], ["existing", item("Item.existing")], ["other", item("Item.other", "ability")],
  ["embedded", { ...item("Item.embedded"), isEmbedded: true }],
]);
const scene = { getFlag: () => ["Item.existing"] };

function drag(type: string, data: Record<string, unknown>): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    payload: { value: data },
    dataTransfer: { value: { dropEffect: "none" } },
    relatedTarget: { value: null },
  });
  return event;
}

beforeEach(() => {
  vi.stubGlobal("game", { scenes: { get: () => scene }, items: { get: (id: string) => items.get(id) }, users: { contents: [] } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1 } });
  vi.stubGlobal("foundry", { applications: { ux: { TextEditor: { implementation: {
    getDragEventData: (event: Event & { payload?: Record<string, unknown> }) => event.payload ?? {},
  } } } } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("POI Scene panel drop", () => {
  it("accepts only a new GM-controlled World pointOfInterest Item", () => {
    expect(classifyPoiSceneDrop({ type: "Item", uuid: "Item.poi" }, "scene")).toEqual({ kind: "valid", itemUuid: "Item.poi" });
    for (const uuid of ["Compendium.world.poi.Item.poi", "Actor.agent.Item.poi", "Item.other", "Item.embedded"]) {
      expect(classifyPoiSceneDrop({ type: "Item", uuid }, "scene")).toEqual({ kind: "invalid" });
    }
    expect(classifyPoiSceneDrop({ type: "Actor", uuid: "Item.poi" }, "scene")).toEqual({ kind: "invalid" });
  });

  it("previews valid drags and adds membership through the supplied mutation callback only on drop", async () => {
    const classes = new Set<string>();
    const root = new EventTarget() as HTMLElement;
    Object.defineProperties(root, {
      classList: { value: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name),
        toggle: (name: string, force: boolean) => force ? classes.add(name) : classes.delete(name) } },
      contains: { value: () => false },
    });
    const document = new EventTarget();
    vi.stubGlobal("document", document);
    const add = vi.fn(async () => undefined);
    const duplicate = vi.fn();
    const stop = listenPoiScenePanelDrop(root, "scene", add, duplicate);
    document.dispatchEvent(drag("dragstart", { type: "Item", uuid: "Item.poi" }));
    const over = drag("dragover", {});
    root.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(classes.has("is-drag-over")).toBe(true);
    root.dispatchEvent(drag("dragleave", {}));
    expect(classes.has("is-drag-over")).toBe(false);
    root.dispatchEvent(drag("dragover", { type: "Item", uuid: "Item.other" }));
    expect(classes.has("is-drag-over")).toBe(false);
    root.dispatchEvent(drag("drop", { type: "Item", uuid: "Item.poi" }));
    expect(add).toHaveBeenCalledExactlyOnceWith("Item.poi");
    expect(duplicate).not.toHaveBeenCalled();
    expect(classes.has("is-drag-over")).toBe(false);
    stop();
  });

  it("reports an existing POI once and ignores invalid drops", () => {
    const root = new EventTarget() as HTMLElement;
    Object.defineProperties(root, { classList: { value: { remove: () => undefined, toggle: () => undefined } } });
    vi.stubGlobal("document", new EventTarget());
    const add = vi.fn(async () => undefined);
    const duplicate = vi.fn();
    const stop = listenPoiScenePanelDrop(root, "scene", add, duplicate);
    root.dispatchEvent(drag("drop", { type: "Item", uuid: "Item.existing" }));
    root.dispatchEvent(drag("drop", { type: "Item", uuid: "Item.other" }));
    root.dispatchEvent(drag("drop", { type: "Item", uuid: "Compendium.world.poi.Item.poi" }));
    expect(add).not.toHaveBeenCalled();
    expect(duplicate).toHaveBeenCalledTimes(1);
    stop();
  });
});
