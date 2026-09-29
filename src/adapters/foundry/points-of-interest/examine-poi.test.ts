import { afterEach, expect, it, vi } from "vitest";
import { createCheckSnapshot } from "../../../application/checks/check-snapshot";
import type { CheckResult } from "../../../core/checks/check";

const state = vi.hoisted(() => ({
  knowledge: [] as { actorUuid: string; informationIds: string[] }[],
  discoveries: [] as { runId: string; actorUuid: string; informationId: string }[],
  itemExaminations: [] as string[], actorExaminations: [] as string[], pd: 2,
}));
vi.mock("./investigation-runtime", () => ({ sceneInvestigationRuntime: () => ({ runId: "run-1" }),
  investigationParticipants: () => [{ uuid: "Actor.agent" }] }));
vi.mock("./poi-runtime-state", () => ({
  worldPoi: () => item, isGmControlledPoi: () => true, readScenePoiUuids: () => ["Item.poi"],
  isPoiVisibleTo: () => true, readPoiVisibility: () => ({}), readPoiKnowledge: () => state.knowledge,
  POI_KNOWLEDGE_PATH: "knowledge",
}));
vi.mock("./poi-discovery", () => ({ readPoiDiscoveries: () => state.discoveries, POI_DISCOVERY_PATH: "discovery" }));
vi.mock("./poi-runtime-queries", () => ({ broadcastPoiInvalidation: vi.fn(),
  serializePoiItemMutation: (_key: string, run: () => unknown) => run() }));
vi.mock("../../../documents/item/point-of-interest-data", () => ({ readPointOfInterestInformation: () => [
  { id: "a", availability: { mode: "always" }, approaches: [{ skill: "research", difficulty: 6 }] },
  { id: "b", availability: { mode: "always" }, approaches: [{ skill: "research", difficulty: 10 }] },
  { id: "situational", availability: { mode: "situational" }, approaches: [{ skill: "research", difficulty: 4 }] },
] }));

const item = {
  system: {}, getFlag: (_scope: string, key: string) => key === "pointOfInterestExaminations" ? state.itemExaminations : undefined,
  update: vi.fn(async (data: Record<string, unknown>) => {
    state.knowledge = (data.knowledge as { agents: typeof state.knowledge }).agents;
    state.discoveries = data.discovery as typeof state.discoveries;
    state.itemExaminations = data["flags.ordemparanormal2.pointOfInterestExaminations"] as string[];
  }),
};
const actor = {
  id: "agent", uuid: "Actor.agent", type: "agent",
  system: { resources: { determination: { get value() { return state.pd; } } } },
  getFlag: (_scope: string, key: string) => key === "investigationExaminations" ? state.actorExaminations : undefined,
  update: vi.fn(async (data: Record<string, unknown>) => {
    state.pd = data["system.resources.determination.value"] as number;
    state.actorExaminations = data["flags.ordemparanormal2.investigationExaminations"] as string[];
  }),
};
const { resolveExaminePoi } = await import("./examine-poi");
afterEach(() => { state.knowledge = []; state.discoveries = []; state.itemExaminations = [];
  state.actorExaminations = []; state.pd = 2; item.update.mockClear(); actor.update.mockClear(); vi.unstubAllGlobals(); });

function setup(): foundry.documents.User {
  const gm = { id: "gm", isGM: true } as foundry.documents.User;
  const result: CheckResult = { check: { kind: "skill", key: "research", name: "Pesquisar" },
    components: [{ kind: "attribute", key: "mind", label: "Mente", die: 8, result: 5 },
      { kind: "skill", key: "research", label: "Pesquisar", die: 8, result: 5 }],
    extraDice: [], total: 10 };
  const snapshot = createCheckSnapshot(result);
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, get: () => gm },
    scenes: { get: () => ({ id: "scene" }) }, actors: { get: () => actor },
    messages: { get: (id: string) => ({ id, speaker: { actor: "agent" },
      getFlag: (_scope: string, key: string) => key === "check" ? snapshot : undefined }) } });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  return gm;
}

it("uses the historical total to grant all permanent information once", async () => {
  const gm = setup();
  const input = { sceneId: "scene", runId: "run-1", itemUuid: "Item.poi", actorUuid: "Actor.agent",
    skill: "research", messageId: "check-1" };
  expect(await resolveExaminePoi(input, gm)).toEqual({ ok: true, newCount: 2, lostPd: 0 });
  expect(state.knowledge[0]?.informationIds).toEqual(["a", "b"]);
  expect(state.discoveries).toHaveLength(2);
  expect(await resolveExaminePoi(input, gm)).toEqual({ ok: true, newCount: 0, lostPd: 0 });
  expect(item.update).toHaveBeenCalledTimes(1);
  expect(actor.update).not.toHaveBeenCalled();
});

it("spends at most one PD when a new Check finds nothing new", async () => {
  const gm = setup();
  state.knowledge = [{ actorUuid: "Actor.agent", informationIds: ["a", "b"] }];
  const input = { sceneId: "scene", runId: "run-1", itemUuid: "Item.poi", actorUuid: "Actor.agent",
    skill: "research", messageId: "check-2" };
  expect(await resolveExaminePoi(input, gm)).toEqual({ ok: true, newCount: 0, lostPd: 1 });
  expect(state.pd).toBe(1);
  expect(await resolveExaminePoi(input, gm)).toEqual({ ok: true, newCount: 0, lostPd: 0 });
  expect(actor.update).toHaveBeenCalledTimes(1);
});
