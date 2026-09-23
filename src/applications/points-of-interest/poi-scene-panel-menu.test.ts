import { describe, expect, it } from "vitest";
import { listenPoiSceneMenuTriggers, poiSceneMenuEntries } from "./poi-scene-panel-menu";

const localize = (key: string) => key;

describe("POI Scene panel menu", () => {
  it("marks the active visibility and disables removal and location appropriately", () => {
    const hidden = poiSceneMenuEntries({ visibility: "hidden", hasLocation: false, linked: false }, localize);
    expect(hidden.find(entry => entry.action === "hide")?.checked).toBe(true);
    expect(hidden.find(entry => entry.action === "locate")?.disabled).toBe(true);
    expect(hidden.find(entry => entry.action === "remove")?.disabled).toBe(false);
    const linked = poiSceneMenuEntries({ visibility: "users", hasLocation: true, linked: true }, localize);
    expect(linked.find(entry => entry.action === "users")?.checked).toBe(true);
    expect(linked.find(entry => entry.action === "locate")?.disabled).toBe(false);
    expect(linked.find(entry => entry.action === "remove")).toMatchObject({ disabled: true,
      hint: "ORDEMPARANORMAL2.PointOfInterest.ScenePanel.UnlinkFirst" });
    expect(poiSceneMenuEntries({ visibility: "everyone", hasLocation: true, linked: false }, localize)
      .find(entry => entry.action === "everyone")?.checked).toBe(true);
  });

  it("routes the three-dot click and right-click through the same menu callback", () => {
    const root = new EventTarget() as EventTarget & { contains(node: unknown): boolean };
    root.contains = node => node === row;
    const row = { dataset: { itemUuid: "Item.poi" }, closest: (selector: string) => selector === "[data-item-uuid]" ? row : null };
    const trigger = { closest: (selector: string) => selector === "[data-poi-menu-trigger]" ? trigger : row,
      getBoundingClientRect: () => ({ right: 42, bottom: 84 }) };
    const calls: Array<{ uuid: string; x: number; y: number }> = [];
    const stop = listenPoiSceneMenuTriggers(root as HTMLElement, (uuid, anchor) => calls.push({ uuid, ...anchor }));
    const click = new Event("click") as MouseEvent;
    Object.defineProperty(click, "target", { value: trigger });
    root.dispatchEvent(click);
    const context = new Event("contextmenu", { cancelable: true }) as MouseEvent;
    Object.defineProperties(context, { target: { value: row }, clientX: { value: 70 }, clientY: { value: 90 } });
    root.dispatchEvent(context);
    expect(context.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ uuid: "Item.poi", x: 42, y: 84 }, { uuid: "Item.poi", x: 70, y: 90 }]);
    stop();
  });
});
