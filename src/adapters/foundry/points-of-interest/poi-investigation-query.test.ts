import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolvePoiInvestigationView } = vi.hoisted(() => ({ resolvePoiInvestigationView: vi.fn() }));
vi.mock("./resolve-poi-investigation-view", () => ({ resolvePoiInvestigationView }));

import {
  POI_INVESTIGATION_QUERY,
  registerPoiInvestigationQuery,
  requestPoiInvestigationView,
} from "./poi-investigation-query";

beforeEach(() => {
  resolvePoiInvestigationView.mockReset().mockResolvedValue({ view: { name: "N", description: "", skills: [] } });
});
afterEach(() => vi.unstubAllGlobals());

describe("POI investigation query transport", () => {
  it("registers the prefixed handler on CONFIG.queries", () => {
    const queries: Record<string, unknown> = {};
    vi.stubGlobal("CONFIG", { queries });
    registerPoiInvestigationQuery();
    expect(POI_INVESTIGATION_QUERY).toBe("ordemparanormal2.poiInvestigation");
    expect(typeof queries[POI_INVESTIGATION_QUERY]).toBe("function");
  });

  it("the handler authorizes against the query context user, not the payload", async () => {
    const queries: Record<string, (data: unknown, ctx: unknown) => unknown> = {};
    const sender = { id: "real-sender" } as foundry.documents.User;
    vi.stubGlobal("CONFIG", { queries });
    registerPoiInvestigationQuery();
    await queries[POI_INVESTIGATION_QUERY](
      { sceneId: "s", regionId: "r", requesterUserId: "forged" },
      { timeout: 10_000, user: sender },
    );
    expect(resolvePoiInvestigationView).toHaveBeenCalledWith({
      sceneId: "s",
      regionId: "r",
      requesterUserId: "real-sender",
    });
  });

  it("a GM resolves locally without querying", async () => {
    vi.stubGlobal("game", { user: { isGM: true, id: "gm1" } });
    const result = await requestPoiInvestigationView({ sceneId: "s", regionId: "r" });
    expect(resolvePoiInvestigationView).toHaveBeenCalledWith({ sceneId: "s", regionId: "r", requesterUserId: "gm1" });
    expect(result).toEqual({ view: { name: "N", description: "", skills: [] } });
  });

  it("a player queries the active GM", async () => {
    const query = vi.fn().mockResolvedValue({ view: { name: "Q", description: "", skills: [] } });
    vi.stubGlobal("game", { user: { isGM: false, id: "p1" }, users: { activeGM: { query } } });
    const result = await requestPoiInvestigationView({ sceneId: "s", regionId: "r" });
    expect(query).toHaveBeenCalledWith("ordemparanormal2.poiInvestigation", { sceneId: "s", regionId: "r" }, { timeout: 10000 });
    expect(result).toEqual({ view: { name: "Q", description: "", skills: [] } });
    expect(resolvePoiInvestigationView).not.toHaveBeenCalled();
  });

  it("preserves a non-empty description through both transport paths", async () => {
    const view = { name: "Armário Azul", description: "<p>Descrição de teste</p>", skills: ["Percepção"] };
    resolvePoiInvestigationView.mockResolvedValue({ view });

    vi.stubGlobal("game", { user: { isGM: true, id: "gm1" } });
    expect(await requestPoiInvestigationView({ sceneId: "s", regionId: "r" })).toEqual({ view });

    const query = vi.fn().mockResolvedValue({ view });
    vi.stubGlobal("game", { user: { isGM: false, id: "p1" }, users: { activeGM: { query } } });
    expect(await requestPoiInvestigationView({ sceneId: "s", regionId: "r" })).toEqual({ view });
  });

  it("returns no-gm when no GM is active, and unavailable when the query fails", async () => {
    vi.stubGlobal("game", { user: { isGM: false, id: "p1" }, users: { activeGM: null } });
    expect(await requestPoiInvestigationView({ sceneId: "s", regionId: "r" })).toEqual({ error: "no-gm" });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const query = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("game", { user: { isGM: false, id: "p1" }, users: { activeGM: { query } } });
    expect(await requestPoiInvestigationView({ sceneId: "s", regionId: "r" })).toEqual({ error: "unavailable" });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
