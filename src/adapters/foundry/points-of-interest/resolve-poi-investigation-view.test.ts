import { afterEach, expect, it, vi } from "vitest";
import { resolvePoiInvestigationView } from "./resolve-poi-investigation-view";

function fixture() {
  const flags: Record<string, unknown> = {
    pointOfInterestVisibility: { mode: "everyone", users: [], notified: [] },
    pointOfInterestKnowledge: { agents: [{ actorUuid: "Actor.a", informationIds: ["secret"] }] },
  };
  const gm = { id: "gm", isGM: true };
  const player = { id: "player", isGM: false };
  const users = [gm, player];
  const actors = ["a", "b"].map(id => ({ id, uuid: `Actor.${id}`, type: "agent",
    testUserPermission: vi.fn(() => true) }));
  const item = { id: "poi", uuid: "Item.poi", type: "pointOfInterest", name: "Computador", img: "icon.svg",
    isEmbedded: false, pack: null, ownership: { default: 0 },
    testUserPermission: () => false, getFlag: (_scope: string, key: string) => flags[key],
    system: { publicDescription: "público", gmContext: "privado", information: [
      { id: "secret", content: "senha", approaches: [
        { skill: "technology", difficulty: 9, showDifficultyToPlayers: false },
        { skill: "research", difficulty: 8, showDifficultyToPlayers: true },
      ] },
      { id: "other", content: "arquivo", approaches: [
        { skill: "technology", difficulty: 6, showDifficultyToPlayers: true },
      ] },
    ] } };
  const scene = { getFlag: (_scope: string, key: string) => key === "pointOfInterestItems" ? ["Item.poi"] : undefined };
  const game = { users: { get: (id: string) => users.find(user => user.id === id), contents: users },
    scenes: { get: (id: string) => id === "scene" ? scene : undefined },
    items: { get: (id: string) => id === "poi" ? item : undefined },
    actors: { get: (id: string) => actors.find(actor => actor.id === id) } };
  vi.stubGlobal("game", game);
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 } });
  vi.stubGlobal("foundry", { applications: { ux: { TextEditor: { implementation: { enrichHTML: async (html: string) => html } } } } });
  return { flags, item, scene, actors, player };
}
afterEach(() => vi.unstubAllGlobals());

it("delivers only information known by the selected OWNER Agent", async () => {
  fixture();
  const request = { sceneId: "scene", itemUuid: "Item.poi", requesterUserId: "player" };
  const first = await resolvePoiInvestigationView({ ...request, actorUuid: "Actor.a" });
  const second = await resolvePoiInvestigationView({ ...request, actorUuid: "Actor.b" });
  expect("view" in first && first.view.skills[0].information).toEqual([
    { visibility: "hidden", content: "senha" }, { visibility: "public", difficulty: 6 },
  ]);
  expect("view" in second && second.view.skills[0].information).toEqual([
    { visibility: "hidden" }, { visibility: "public", difficulty: 6 },
  ]);
  expect("view" in first && first.view.skills[1].information).toEqual([
    { visibility: "public", difficulty: 8, content: "senha" },
  ]);
  const serialized = JSON.stringify(second);
  expect(serialized).not.toContain("privado");
  expect(serialized).not.toContain("senha");
  expect(serialized).not.toContain('"difficulty":9');
  expect(serialized).not.toContain('"id"');
});

it("rejects hidden or unlinked POIs and a non-owned Agent", async () => {
  const f = fixture();
  const request = { sceneId: "scene", itemUuid: "Item.poi", actorUuid: "Actor.a", requesterUserId: "player" };
  f.actors[0].testUserPermission.mockReturnValue(false);
  expect(await resolvePoiInvestigationView(request)).toEqual({ error: "forbidden" });
  f.flags.pointOfInterestVisibility = { mode: "hidden" };
  expect(await resolvePoiInvestigationView(request)).toEqual({ error: "forbidden" });
  f.scene.getFlag = () => [];
  expect(await resolvePoiInvestigationView(request)).toEqual({ error: "unavailable" });
});

it("ignores player-writable Actor flags when deciding knowledge", async () => {
  const f = fixture();
  (f.actors[1] as typeof f.actors[number] & { flags?: unknown }).flags = { ordemparanormal2: { investigationKnowledge: ["secret"] } };
  const result = await resolvePoiInvestigationView({ sceneId: "scene", itemUuid: "Item.poi", actorUuid: "Actor.b", requesterUserId: "player" });
  expect(JSON.stringify(result)).not.toContain("senha");
});

it("rejects a POI whose ownership permits non-GM Item access", async () => {
  const f = fixture();
  f.item.ownership.default = 2;
  expect(await resolvePoiInvestigationView({ sceneId: "scene", itemUuid: "Item.poi", actorUuid: "Actor.a", requesterUserId: "player" }))
    .toEqual({ error: "unavailable" });
});
