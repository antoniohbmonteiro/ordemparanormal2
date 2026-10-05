import { afterEach, expect, it, vi } from "vitest";

const { resolvePoiInvestigationView } = vi.hoisted(() => ({ resolvePoiInvestigationView: vi.fn().mockResolvedValue({ error: "forbidden" }) }));
vi.mock("./resolve-poi-investigation-view", () => ({ resolvePoiInvestigationView }));
import { POI_INVESTIGATION_QUERY, registerPoiInvestigationQuery, requestPoiInvestigationView } from "./poi-investigation-query";
afterEach(() => vi.unstubAllGlobals());

it("uses the query context User instead of a forged payload user ID", async () => {
  const queries: Record<string, (data: unknown, context: unknown) => Promise<unknown>> = {};
  vi.stubGlobal("CONFIG", { queries });
  registerPoiInvestigationQuery();
  await queries[POI_INVESTIGATION_QUERY]({ sceneId: "s", itemUuid: "Item.poi", actorUuid: "Actor.a", requesterUserId: "forged" },
    { user: { id: "real" } });
  expect(resolvePoiInvestigationView).toHaveBeenCalledWith({ sceneId: "s", itemUuid: "Item.poi", actorUuid: "Actor.a", requesterUserId: "real" });
});

it("asks only the active GM for a player's projection", async () => {
  const query = vi.fn().mockResolvedValue({ error: "forbidden" });
  vi.stubGlobal("game", { user: { id: "player", isGM: false }, users: { activeGM: { query } } });
  await requestPoiInvestigationView({ sceneId: "s", itemUuid: "Item.poi", actorUuid: "Actor.a" });
  expect(query).toHaveBeenCalledWith(POI_INVESTIGATION_QUERY,
    { sceneId: "s", itemUuid: "Item.poi", actorUuid: "Actor.a" }, { timeout: 10000 });
});
