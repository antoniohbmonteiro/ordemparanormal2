import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  knowledge: [] as { actorUuid: string; informationIds: string[] }[],
  discoveries: [] as { runId: string; actorUuid: string; informationId: string }[],
}));
vi.mock("./investigation-runtime", () => ({
  sceneInvestigationRuntime: () => ({ runId: "run-1" }),
  investigationParticipants: () => [{ uuid: "Actor.agent" }],
}));
vi.mock("./poi-runtime-state", () => ({
  worldPoi: () => item,
  isGmControlledPoi: () => true,
  readScenePoiUuids: () => ["Item.poi"],
  isPoiVisibleTo: () => true,
  readPoiVisibility: () => ({}),
  readPoiKnowledge: () => state.knowledge,
  POI_KNOWLEDGE_PATH: "knowledge",
}));
vi.mock("./poi-discovery", () => ({
  readPoiDiscoveries: () => state.discoveries,
  POI_DISCOVERY_PATH: "discovery",
}));
vi.mock("./poi-runtime-queries", () => ({ broadcastPoiInvalidation: vi.fn(), serializePoiItemMutation: (_key: string, run: () => unknown) => run() }));
vi.mock("../actors/read-agent-check-source", () => ({ readAgentCheckSource: () => ({ skills: { research: 10 } }) }));
vi.mock("../../../documents/item/point-of-interest-data", () => ({
  isAptitudeSpecializationKey: () => false,
  readPointOfInterestInformation: () => [
    { id: "a", availability: { mode: "always" }, approaches: [{ skill: "research", difficulty: 6 }] },
    { id: "b", availability: { mode: "always" }, approaches: [{ skill: "research", difficulty: 10 }] },
    { id: "situational", availability: { mode: "situational" }, approaches: [{ skill: "research", difficulty: 4 }] },
  ],
}));

const item = {
  system: {},
  update: vi.fn(async (data: Record<string, unknown>) => {
    state.knowledge = (data.knowledge as { agents: typeof state.knowledge }).agents;
    state.discoveries = data.discovery as typeof state.discoveries;
  }),
};
const { resolveInvestigatePoi } = await import("./investigate-poi");
afterEach(() => { state.knowledge = []; state.discoveries = []; item.update.mockClear(); vi.unstubAllGlobals(); });

it("grants all reachable permanent information once, with run provenance, through the active GM", async () => {
  const gm = { id: "gm", isGM: true };
  const actor = { uuid: "Actor.agent", type: "agent" };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, get: () => gm },
    scenes: { get: () => ({ id: "scene" }) }, actors: { get: () => actor } });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  const input = { sceneId: "scene", runId: "run-1", itemUuid: "Item.poi", actorUuid: "Actor.agent", skill: "research" };
  expect(await resolveInvestigatePoi(input, gm as foundry.documents.User)).toEqual({ ok: true, newCount: 2 });
  expect(state.knowledge).toEqual([{ actorUuid: "Actor.agent", informationIds: ["a", "b"] }]);
  expect(state.discoveries).toEqual([
    { runId: "run-1", actorUuid: "Actor.agent", informationId: "a" },
    { runId: "run-1", actorUuid: "Actor.agent", informationId: "b" },
  ]);
  expect(await resolveInvestigatePoi(input, gm as foundry.documents.User)).toEqual({ ok: true, newCount: 0 });
  expect(item.update).toHaveBeenCalledTimes(1);
});

it("rejects a caller who is not the active GM without writing knowledge", async () => {
  const requester = { id: "player", isGM: false };
  vi.stubGlobal("game", { user: requester, users: { activeGM: { id: "gm" }, get: () => requester } });
  expect(await resolveInvestigatePoi({ sceneId: "scene", runId: "run-1", itemUuid: "Item.poi",
    actorUuid: "Actor.agent", skill: "research" }, requester as foundry.documents.User))
    .toEqual({ ok: false, reason: "forbidden" });
  expect(item.update).not.toHaveBeenCalled();
});
