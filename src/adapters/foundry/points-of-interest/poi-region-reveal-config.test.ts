import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PoiTestElement, poiTestDocument, flushPoiTasks } from "../../../applications/points-of-interest/poi-dom-test-fixture";
import { renderPoiRegionRevealConfig } from "./poi-region-reveal-config";

const { apply, listPlayerUsers } = vi.hoisted(() => ({ apply: vi.fn(), listPlayerUsers: vi.fn() }));
vi.mock("./apply-poi-region-reveal", () => ({ applyPoiRegionReveal: apply }));
vi.mock("../users/list-player-users", () => ({ listPlayerUsers }));

class ForcedReplacement {
  private constructor(readonly value: unknown) {}
  static create(value: unknown): ForcedReplacement { return new ForcedReplacement(value); }
}

interface Flags { association?: unknown; reveal?: unknown }

function fixture(flags: Flags = { association: { itemUuid: "Item.poi" } }) {
  const app = Object.assign(new EventTarget(), {
    document: {
      id: "region",
      documentName: "Region",
      parent: { id: "scene", regions: { get: (): unknown => undefined } },
      getFlag: vi.fn((_scope: string, key: string) =>
        key === "pointOfInterestReveal" ? flags.reveal : flags.association),
      update: vi.fn().mockResolvedValue(undefined),
    },
    isEditable: true,
    form: new PoiTestElement("form"),
    window: { content: new PoiTestElement() },
  });
  app.document.parent.regions.get = () => app.document;
  const content = app.window.content;
  const first = (tag: string) => content.find(el => el.tagName === tag);
  const users = () => content.find(el => el.className === "op2-poi-region-reveal__users");
  const button = () => content.find(el => el.tagName === "button")!;
  const status = () => content.find(el => el.tagName === "p")!;
  const changeMode = (value: string) => {
    const select = first("select")!;
    select.value = value;
    select.dispatchEvent(new Event("change"));
  };
  return { app, content, first, users, button, status, changeMode };
}

beforeEach(() => {
  apply.mockReset().mockResolvedValue(undefined);
  listPlayerUsers.mockReset().mockReturnValue([
    { id: "p1", name: "Player One" },
    { id: "p2", name: "Player Two" },
  ]);
  vi.stubGlobal("document", poiTestDocument);
  vi.stubGlobal("game", {
    user: { isGM: true },
    i18n: {
      localize: (key: string) => key,
      format: (key: string, data: Record<string, unknown>) => `${key}:${JSON.stringify(data)}`,
    },
  });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("POI RegionConfig player visibility", () => {
  it("registers the scoped stylesheet with only .op2-poi- selectors", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../../system.json", import.meta.url), "utf8"));
    const language = JSON.parse(readFileSync(new URL("../../../../lang/pt-BR.json", import.meta.url), "utf8"));
    const css = readFileSync(new URL("../../../../styles/poi-region-reveal-config.css", import.meta.url), "utf8");
    expect(manifest.styles).toContain("styles/poi-region-reveal-config.css");
    expect(language.ORDEMPARANORMAL2.PointOfInterest.Reveal.Title).toBe("Visibilidade para jogadores");
    expect([...css.matchAll(/([^{}]+)\{/g)].every(match => match[1].trim().startsWith(".op2-poi-"))).toBe(true);
  });

  it("adds nothing for players, preview documents or Regions without a POI association", () => {
    const cases = [
      () => { vi.stubGlobal("game", { user: { isGM: false }, i18n: { localize: (k: string) => k, format: (k: string) => k } }); return fixture(); },
      () => { const f = fixture(); f.app.document.parent.regions.get = () => ({ ...f.app.document }); return f; },
      () => fixture({ association: undefined }),
    ];
    for (const build of cases) {
      const { app, content } = build();
      renderPoiRegionRevealConfig(app);
      expect(content.children).toHaveLength(0);
    }
  });

  it("shows a mode selector and apply button reflecting the persisted reveal", () => {
    const { app, first, button, status } = fixture({
      association: { itemUuid: "Item.poi" },
      reveal: { mode: "everyone", users: [], notified: ["p1"] },
    });
    renderPoiRegionRevealConfig(app);
    expect(first("select")!.value).toBe("everyone");
    expect(status().textContent).toBe("ORDEMPARANORMAL2.PointOfInterest.Reveal.StatusEveryone");
    expect(button().textContent).toBe("ORDEMPARANORMAL2.PointOfInterest.Reveal.Apply");
    expect(button().disabled).toBe(true);
  });

  it("renders a player checklist in users mode from listPlayerUsers", () => {
    const { app, changeMode, users } = fixture({
      association: { itemUuid: "Item.poi" },
      reveal: { mode: "users", users: ["p2"], notified: [] },
    });
    renderPoiRegionRevealConfig(app);
    const list = users()!;
    expect(list.children).toHaveLength(2);
    const checkboxes = list.children.map(row => row.children[0]);
    expect(checkboxes.map(box => box.value)).toEqual(["p1", "p2"]);
    expect(checkboxes.map(box => box.checked)).toEqual([false, true]);

    changeMode("hidden");
    expect(users()).toBeUndefined();
  });

  it("applies immediately with a normalized input and reports success", async () => {
    const { app, changeMode, button, status } = fixture({ association: { itemUuid: "Item.poi" } });
    renderPoiRegionRevealConfig(app);
    changeMode("everyone");
    expect(button().disabled).toBe(false);
    button().click();
    await flushPoiTasks();

    expect(apply).toHaveBeenCalledExactlyOnceWith(
      app.document,
      { mode: "everyone", users: [] },
      expect.objectContaining({
        listPlayerUserIds: expect.any(Function),
        publishNotice: expect.any(Function),
      }),
    );
    expect(status().textContent).toBe("ORDEMPARANORMAL2.PointOfInterest.Reveal.Applied");
  });

  it("reports failure only when persistence fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    apply.mockRejectedValue(new Error("update failed"));
    const { app, changeMode, button, status } = fixture({ association: { itemUuid: "Item.poi" } });
    renderPoiRegionRevealConfig(app);
    changeMode("everyone");
    button().click();
    await flushPoiTasks();

    expect(status().textContent).toBe("ORDEMPARANORMAL2.PointOfInterest.Reveal.ApplyFailed");
    error.mockRestore();
  });

  it("discards its section when the sheet closes", () => {
    const { app, content } = fixture();
    renderPoiRegionRevealConfig(app);
    expect(content.children).toHaveLength(1);
    app.dispatchEvent(new Event("close"));
    expect(content.children).toHaveLength(0);
  });
});
