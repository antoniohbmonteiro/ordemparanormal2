import { afterEach, expect, it, vi } from "vitest";

const { mutatePoi, reconcileScenePoiMembership, registerPoiRuntimeQueries, registerPoiInvestigationQuery } = vi.hoisted(() => ({
  mutatePoi: vi.fn().mockResolvedValue({ ok: true }),
  reconcileScenePoiMembership: vi.fn().mockResolvedValue(undefined),
  registerPoiRuntimeQueries: vi.fn(), registerPoiInvestigationQuery: vi.fn(),
}));
vi.mock("../adapters/foundry/points-of-interest/poi-runtime-queries", () => ({ mutatePoi, reconcileScenePoiMembership, registerPoiRuntimeQueries }));
vi.mock("../adapters/foundry/points-of-interest/poi-investigation-query", () => ({ registerPoiInvestigationQuery }));
import { registerPoiInvestigation } from "./register-poi-investigation";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("lets only the active GM add Region associations and reconcile at startup", async () => {
  const hooks = new Map<string, (...args: unknown[]) => void>();
  const gm = { id: "gm", isGM: true };
  const other = { id: "other", isGM: true };
  const game = { user: other, users: { activeGM: gm }, i18n: { localize: (key: string) => key } };
  vi.stubGlobal("game", game);
  vi.stubGlobal("Hooks", { on: (name: string, fn: (...args: unknown[]) => void) => hooks.set(name, fn),
    once: (name: string, fn: (...args: unknown[]) => void) => hooks.set(name, fn) });
  registerPoiInvestigation();
  const region = { parent: { id: "scene" }, getFlag: () => ({ itemUuid: "Item.poi" }) };
  hooks.get("updateRegion")!(region);
  hooks.get("ready")!();
  expect(mutatePoi).not.toHaveBeenCalled();
  expect(reconcileScenePoiMembership).toHaveBeenCalledOnce();
  game.user = gm;
  hooks.get("createRegion")!(region);
  await vi.waitFor(() => expect(mutatePoi).toHaveBeenCalledWith({ action: "add", sceneId: "scene", itemUuid: "Item.poi" }));
  expect(registerPoiRuntimeQueries).toHaveBeenCalledOnce();
  expect(registerPoiInvestigationQuery).toHaveBeenCalledOnce();
});
