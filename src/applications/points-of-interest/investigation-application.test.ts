import { afterEach, expect, it, vi } from "vitest";

vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base: unknown) => base } } });
const { buildInvestigationRenderContext, investigationApplicationKey, openInvestigationApplication, releaseInvestigationApplication } = await import("./investigation-application");
afterEach(() => vi.unstubAllGlobals());

it("keys one window by World Item and updates its Scene context on reopen", () => {
  const render = vi.fn(); const bringToFront = vi.fn(); const updateContext = vi.fn();
  const create = vi.fn(() => ({ render, bringToFront, updateContext, refresh: vi.fn() }));
  const first = { sceneId: "first", itemUuid: "Item.poi", name: "POI" };
  const second = { ...first, sceneId: "second" };
  expect(investigationApplicationKey(first.itemUuid)).toBe("Item.poi");
  openInvestigationApplication(first, create);
  openInvestigationApplication(second, create);
  expect(create).toHaveBeenCalledOnce();
  expect(updateContext).toHaveBeenCalledExactlyOnceWith(second);
  expect(bringToFront).toHaveBeenCalledOnce();
  releaseInvestigationApplication(first.itemUuid);
});

it("renders private content only when supplied by the sanitized player projection", () => {
  const localize = (key: string) => key;
  const agents = [{ uuid: "Actor.a", name: "Agent", selected: true }];
  const context = buildInvestigationRenderContext("POI", { view: {
    audience: "player", name: "POI", description: "Público", img: "", skills: [{ key: "perception", name: "Percepção", information: [
      { visibility: "hidden", content: "Conhecida" }, { visibility: "hidden" },
    ] }],
  } }, localize, agents);
  expect(context.canExamine).toBe(true);
  expect(context.isPlayer && context.skills[0].information.map(row => row.content)).toEqual(["Conhecida", ""]);
});
