import { afterEach, expect, it, vi } from "vitest";
import { examinableAptitudeSpecializations } from "../../../documents/item/point-of-interest-data";
import { POI_INVESTIGATION_QUERY, registerPoiInvestigationQuery } from "./poi-investigation-query";
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
    // Stored before information availability existed, so it reads as always available.
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

function withSituational(f: ReturnType<typeof fixture>) {
  f.item.system.information.push(
    { id: "vault", content: "cofre secreto", availability: { mode: "situational", condition: "Requer a chave dourada." },
      approaches: [{ skill: "technology", difficulty: 12, showDifficultyToPlayers: true }] } as never,
    { id: "diary", content: "diário escondido", availability: { mode: "situational", condition: "Apenas a médica." },
      approaches: [{ skill: "aptitude", specialization: "arts", difficulty: 7, showDifficultyToPlayers: true }] } as never,
  );
}

it("gives the GM always and situational information, marking only the situational condition", async () => {
  const f = fixture();
  withSituational(f);
  f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.a", informationIds: ["secret", "vault"] }] };
  const result = await resolvePoiInvestigationView({ sceneId: "scene", itemUuid: "Item.poi", requesterUserId: "gm" });
  const view = "view" in result && result.view.audience === "gm" ? result.view : null;
  expect(view?.skills.map(skill => [skill.key, skill.information.map(entry => [entry.id, entry.condition ?? null, entry.knownCount])]))
    .toEqual([
      ["technology", [["secret", null, 1], ["other", null, 0], ["vault", "Requer a chave dourada.", 1]]],
      ["research", [["secret", null, 1]]],
      ["aptitude", [["diary", "Apenas a médica.", 0]]],
    ]);
});

it("never sends unknown situational information, or any trace of it, to a player", async () => {
  const f = fixture();
  withSituational(f);
  const result = await resolvePoiInvestigationView({ sceneId: "scene", itemUuid: "Item.poi", actorUuid: "Actor.b",
    requesterUserId: "player" });
  expect("view" in result && result.view.skills.map(skill => [skill.key, skill.information])).toEqual([
    ["technology", [{ visibility: "hidden" }, { visibility: "public", difficulty: 6 }]],
    ["research", [{ visibility: "public", difficulty: 8 }]],
  ]);
  const serialized = JSON.stringify(result);
  for (const secret of ["cofre", "diário", "chave dourada", "médica", "vault", "diary", "situational", "condition",
    "availability", '"difficulty":12', '"difficulty":7', "arts", "aptitude"]) expect(serialized).not.toContain(secret);
});

it("delivers known situational information as ordinary known content without its private condition", async () => {
  const f = fixture();
  withSituational(f);
  f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.b", informationIds: ["vault"] }] };
  const result = await resolvePoiInvestigationView({ sceneId: "scene", itemUuid: "Item.poi", actorUuid: "Actor.b",
    requesterUserId: "player" });
  expect("view" in result && result.view.skills.find(skill => skill.key === "technology")?.information).toEqual([
    { visibility: "hidden" }, { visibility: "public", difficulty: 6 }, { visibility: "public", difficulty: 12, content: "cofre secreto" },
  ]);
  const serialized = JSON.stringify(result);
  for (const secret of ["chave dourada", "situational", "condition", "availability", "diário", "médica"]) {
    expect(serialized).not.toContain(secret);
  }
});

it("offers for Examinar only Aptitude specializations with examinable information in the player projection", async () => {
  const f = fixture();
  const aptitude = (specialization: string, difficulty: number) =>
    [{ skill: "aptitude", specialization, difficulty, showDifficultyToPlayers: false }];
  f.item.system.information.push(
    { id: "news", content: "notícia", approaches: aptitude("currentAffairs", 6) } as never,
    { id: "history", content: "história", approaches: aptitude("humanities", 8) } as never,
    { id: "plan", content: "plano secreto", availability: { mode: "situational", condition: "Requer o mapa." },
      approaches: aptitude("tactics", 10) } as never,
  );
  f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.b", informationIds: ["history"] }] };
  const result = await resolvePoiInvestigationView({ sceneId: "scene", itemUuid: "Item.poi", actorUuid: "Actor.b",
    requesterUserId: "player" });
  const skill = "view" in result && result.view.audience === "player"
    ? result.view.skills.find(entry => entry.key === "aptitude") : undefined;
  // Atualidades: always and unknown; Humanas: already known; Tática: unknown situational, absent from the projection.
  expect(skill && examinableAptitudeSpecializations(skill)).toEqual(["currentAffairs"]);
  expect(JSON.stringify(result)).not.toMatch(/tactics|plano secreto|Requer o mapa/u);
  f.flags.pointOfInterestKnowledge = { agents: [{ actorUuid: "Actor.b", informationIds: ["news", "history"] }] };
  const known = await resolvePoiInvestigationView({ sceneId: "scene", itemUuid: "Item.poi", actorUuid: "Actor.b",
    requesterUserId: "player" });
  const knownSkill = "view" in known && known.view.audience === "player"
    ? known.view.skills.find(entry => entry.key === "aptitude") : undefined;
  expect(knownSkill && examinableAptitudeSpecializations(knownSkill)).toEqual([]);
});

it("answers a player's query with the sanitized projection even when the payload claims a GM requester", async () => {
  const f = fixture();
  withSituational(f);
  const queries: Record<string, (data: unknown, context: unknown) => Promise<unknown>> = {};
  vi.stubGlobal("CONFIG", { queries });
  registerPoiInvestigationQuery();
  const result = await queries[POI_INVESTIGATION_QUERY]({ sceneId: "scene", itemUuid: "Item.poi", actorUuid: "Actor.b",
    requesterUserId: "gm" }, { user: f.player }) as Awaited<ReturnType<typeof resolvePoiInvestigationView>>;
  expect("view" in result && result.view.audience).toBe("player");
  const serialized = JSON.stringify(result);
  for (const secret of ["cofre", "chave dourada", "diário", "privado", "condition"]) expect(serialized).not.toContain(secret);
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
