import { afterEach, expect, it, vi } from "vitest";

const { transferNarrative, narrativeClues, invalidate } = vi.hoisted(() => ({ transferNarrative: vi.fn(), narrativeClues: vi.fn(), invalidate: vi.fn() }));
let knowledge = [
  { actorUuid: "Actor.sender", informationIds: ["clue"] },
  { actorUuid: "Actor.receiver", informationIds: [] as string[] },
];
let visibility = { mode: "hidden" as "hidden" | "users", users: [] as string[], notified: [] as string[] };
let shares: unknown;
const item = { uuid: "Item.poi", name: "POI", system: {},
  getFlag: (_scope: string, key: string) => key === "pointOfInterestShares" ? shares : undefined,
  update: vi.fn(async (data: Record<string, unknown>) => {
    if (data["flags.ordemparanormal2.pointOfInterestKnowledge"]) knowledge =
      (data["flags.ordemparanormal2.pointOfInterestKnowledge"] as { agents: typeof knowledge }).agents;
    if (data["flags.ordemparanormal2.pointOfInterestShares"]) shares = data["flags.ordemparanormal2.pointOfInterestShares"];
    if (data["flags.ordemparanormal2.pointOfInterestVisibility"]) visibility =
      data["flags.ordemparanormal2.pointOfInterestVisibility"] as typeof visibility;
  }) };
vi.mock("../../../documents/item/point-of-interest-data", () => ({ readPointOfInterestInformation: () =>
  [{ id: "clue", content: "Conhecida" }, { id: "other", content: "Privada" }] }));
vi.mock("./investigation-clues", () => ({ narrativeCluesForScene: narrativeClues, transferNarrativeClue: transferNarrative }));
vi.mock("./investigation-runtime", () => ({ sceneInvestigationRuntime: () => ({ runId: "run" }),
  investigationParticipants: () => [{ uuid: "Actor.sender" }, { uuid: "Actor.receiver" }] }));
vi.mock("./poi-discovery", () => ({ readPoiDiscoveries: () =>
  [{ runId: "run", actorUuid: "Actor.sender", informationId: "clue" }] }));
vi.mock("./poi-runtime-queries", () => ({ broadcastPoiInvalidation: invalidate,
  serializePoiItemMutation: (_key: string, run: () => Promise<unknown>) => run() }));
vi.mock("./poi-runtime-state", () => ({ readScenePoiUuids: () => ["Item.poi"], worldPoi: () => item,
  readPoiKnowledge: () => knowledge, readPoiVisibility: () => visibility,
  isPoiVisibleTo: (state: typeof visibility, id: string) => state.mode === "users" && state.users.includes(id),
  POI_KNOWLEDGE_PATH: "flags.ordemparanormal2.pointOfInterestKnowledge",
  POI_VISIBILITY_PATH: "flags.ordemparanormal2.pointOfInterestVisibility" }));
const { transferShareClue } = await import("./investigation-share");

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); shares = undefined;
  knowledge = [{ actorUuid: "Actor.sender", informationIds: ["clue"] }, { actorUuid: "Actor.receiver", informationIds: [] }];
  visibility = { mode: "hidden", users: [], notified: [] }; });

function setup() {
  narrativeClues.mockReturnValue([]);
  const gm = { id: "gm", isGM: true };
  const receiver = { uuid: "Actor.receiver", testUserPermission: (user: { id: string }) => user.id === "player" };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, contents: [gm, { id: "player", isGM: false }] },
    actors: { get: () => receiver } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
}

it("transfers one POI clue and grants receiver visibility idempotently without discovery provenance", async () => {
  setup();
  const args = [{} as foundry.documents.Scene, "run", "Actor.sender", "Actor.receiver",
    { kind: "poi", itemUuid: "Item.poi", informationId: "clue" }] as const;
  expect(await transferShareClue(...args)).toBe(true);
  expect(knowledge[1].informationIds).toEqual(["clue"]);
  expect(visibility).toMatchObject({ mode: "users", users: ["player"] });
  expect(JSON.stringify(shares)).toContain("Actor.sender");
  expect(item.update.mock.calls.flatMap(([data]) => Object.keys(data))).not.toContain("flags.ordemparanormal2.pointOfInterestDiscovery");
  expect(await transferShareClue(...args)).toBe(true);
  expect(item.update).toHaveBeenCalledTimes(2);
});

it("does not grant POI visibility for a narrative clue", async () => {
  setup(); transferNarrative.mockResolvedValue(true);
  narrativeClues.mockReturnValue([{ id: "clue", runId: "run", knownAgentUuids: ["Actor.sender"], text: "Narrativa" }]);
  vi.mocked(item.update).mockClear();
  // The narrative branch delegates to the existing clue transfer without touching a POI.
  expect(await transferShareClue({} as foundry.documents.Scene, "run", "Actor.sender", "Actor.receiver",
    { kind: "narrative", clueId: "clue" })).toBe(true);
  expect(item.update).not.toHaveBeenCalled();
});
