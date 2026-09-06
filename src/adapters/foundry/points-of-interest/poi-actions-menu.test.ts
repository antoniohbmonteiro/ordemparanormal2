import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PoiTestElement, poiTestDocument, flushPoiTasks } from "../../../applications/points-of-interest/poi-dom-test-fixture";
import { defaultPoiActionsMenuDeps, openPoiActionsMenu, type PoiActionsMenuDeps } from "./poi-actions-menu";
import type { PoiActionTarget } from "./poi-canvas-session";

const target: PoiActionTarget = { regionId: "r1", itemUuid: "Item.poi", name: "Sala 3" };

function fixture(revealFlag: unknown = undefined) {
  const region = { update: vi.fn().mockResolvedValue(undefined), getFlag: vi.fn(() => revealFlag) };
  const mount = new PoiTestElement("body");
  const deps: PoiActionsMenuDeps = {
    resolveRegion: vi.fn(() => region),
    openItem: vi.fn().mockResolvedValue(undefined),
    applyReveal: vi.fn().mockResolvedValue(undefined),
    pickUsers: vi.fn().mockResolvedValue(null),
    mount,
    dismiss: new EventTarget(),
  };
  const menu = () => mount.children[0];
  const click = (key: string) => {
    const button = menu()?.find(el => el.tagName === "button" && el.textContent.endsWith(key));
    button?.click();
  };
  return { region, mount, deps, menu, click };
}

beforeEach(() => {
  vi.stubGlobal("document", poiTestDocument);
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
});
afterEach(() => vi.unstubAllGlobals());

describe("POI actions menu", () => {
  it("mounts a small menu with the POI name and the four actions", () => {
    const f = fixture();
    openPoiActionsMenu(target, { x: 10, y: 20 }, f.deps);
    const labels = f.menu().children.filter(el => el.tagName === "button").map(el => el.textContent);
    expect(f.menu().find(el => el.className === "op2-poi-actions-menu__title")?.textContent).toBe("Sala 3");
    expect(labels).toEqual([
      "ORDEMPARANORMAL2.PointOfInterest.Reveal.Menu.Open",
      "ORDEMPARANORMAL2.PointOfInterest.Reveal.Menu.Everyone",
      "ORDEMPARANORMAL2.PointOfInterest.Reveal.Menu.Users",
      "ORDEMPARANORMAL2.PointOfInterest.Reveal.Menu.Hide",
    ]);
  });

  it("Mostrar para todos applies mode everyone and closes the menu", () => {
    const f = fixture();
    openPoiActionsMenu(target, { x: 0, y: 0 }, f.deps);
    f.click("Menu.Everyone");
    expect(f.deps.applyReveal).toHaveBeenCalledExactlyOnceWith(f.region, { mode: "everyone", users: [] });
    expect(f.mount.children).toHaveLength(0);
  });

  it("Ocultar applies mode hidden", () => {
    const f = fixture();
    openPoiActionsMenu(target, { x: 0, y: 0 }, f.deps);
    f.click("Menu.Hide");
    expect(f.deps.applyReveal).toHaveBeenCalledExactlyOnceWith(f.region, { mode: "hidden", users: [] });
  });

  it("Mostrar para… pre-selects reveal.users and applies the chosen ids", async () => {
    const f = fixture({ mode: "users", users: ["p1"] });
    vi.mocked(f.deps.pickUsers).mockResolvedValue(["p1", "p2"]);
    openPoiActionsMenu(target, { x: 0, y: 0 }, f.deps);
    f.click("Menu.Users");
    await flushPoiTasks();
    expect(f.deps.pickUsers).toHaveBeenCalledWith(["p1"]);
    expect(f.deps.applyReveal).toHaveBeenCalledExactlyOnceWith(f.region, { mode: "users", users: ["p1", "p2"] });
  });

  it("Mostrar para… cancelled leaves the state untouched", async () => {
    const f = fixture({ mode: "everyone" });
    vi.mocked(f.deps.pickUsers).mockResolvedValue(null);
    openPoiActionsMenu(target, { x: 0, y: 0 }, f.deps);
    f.click("Menu.Users");
    await flushPoiTasks();
    expect(f.deps.pickUsers).toHaveBeenCalledWith([]);
    expect(f.deps.applyReveal).not.toHaveBeenCalled();
    expect(f.region.update).not.toHaveBeenCalled();
  });

  it("Abrir POI opens the associated Item", () => {
    const f = fixture();
    openPoiActionsMenu(target, { x: 0, y: 0 }, f.deps);
    f.click("Menu.Open");
    expect(f.deps.openItem).toHaveBeenCalledExactlyOnceWith("Item.poi");
  });

  it("does nothing harmful when the Region can no longer be resolved", () => {
    const f = fixture();
    vi.mocked(f.deps.resolveRegion).mockReturnValue(null);
    openPoiActionsMenu(target, { x: 0, y: 0 }, f.deps);
    f.click("Menu.Everyone");
    expect(f.deps.applyReveal).not.toHaveBeenCalled();
    expect(f.mount.children).toHaveLength(0);
  });

  it("only one menu exists at a time", () => {
    const f = fixture();
    openPoiActionsMenu(target, { x: 0, y: 0 }, f.deps);
    openPoiActionsMenu(target, { x: 5, y: 5 }, f.deps);
    expect(f.mount.children).toHaveLength(1);
  });
});

describe("default actions menu deps", () => {
  beforeEach(() => {
    vi.stubGlobal("document", poiTestDocument);
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("ui", { notifications: { warn: vi.fn(), error: vi.fn() } });
    vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
  });

  it("opens a valid POI Item sheet", async () => {
    const render = vi.fn();
    vi.stubGlobal("fromUuid", vi.fn().mockResolvedValue({ type: "pointOfInterest", sheet: { render } }));
    await defaultPoiActionsMenuDeps().openItem("Item.poi");
    expect(render).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("notifies instead of throwing when the Item is unavailable", async () => {
    vi.stubGlobal("fromUuid", vi.fn().mockResolvedValue(null));
    await defaultPoiActionsMenuDeps().openItem("Item.gone");
    expect((ui.notifications.warn as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });
});
