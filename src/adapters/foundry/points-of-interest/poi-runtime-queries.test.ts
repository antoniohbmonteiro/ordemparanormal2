import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mutatePoi, POI_MUTATION_QUERY, reconcileScenePoiMembership, registerPoiRuntimeQueries, resolvePoiScene } from "./poi-runtime-queries";

vi.mock("./publish-poi-reveal-notice", () => ({ publishPoiRevealNotice: vi.fn().mockResolvedValue(undefined) }));

function world() {
  const flags: Record<string, unknown> = {};
  const sceneFlags: Record<string, unknown> = {};
  const region = { id: "r1", getFlag: (_scope: string, key: string) => key === "pointOfInterest" ? { itemUuid: "Item.poi" } : undefined };
  const regions = [region];
  const scene = { id: "scene", regions, getFlag: (_scope: string, key: string) => sceneFlags[key],
    update: vi.fn(async (data: Record<string, unknown>) => { sceneFlags.pointOfInterestItems = data["flags.ordemparanormal2.pointOfInterestItems"]; }) };
  const item = { id: "poi", uuid: "Item.poi", type: "pointOfInterest", name: "Armário", img: "icon.svg", isEmbedded: false, pack: null,
    ownership: { default: 0 }, system: { information: [{ id: "clue", content: "segredo", approaches: [{ skill: "perception", difficulty: 6, showDifficultyToPlayers: false }] }] },
    getFlag: (_scope: string, key: string) => flags[key],
    testUserPermission: () => false,
    update: vi.fn(async (data: Record<string, unknown>) => {
      if (data["flags.ordemparanormal2.pointOfInterestVisibility"]) flags.pointOfInterestVisibility = data["flags.ordemparanormal2.pointOfInterestVisibility"];
      if (data["flags.ordemparanormal2.pointOfInterestKnowledge"]) flags.pointOfInterestKnowledge = data["flags.ordemparanormal2.pointOfInterestKnowledge"];
    }) };
  const actor = { id: "a1", uuid: "Actor.a1", type: "agent" };
  const otherActor = { id: "a2", uuid: "Actor.a2", type: "agent" };
  const gm = { id: "gm", isGM: true, active: false, query: vi.fn() };
  const second = { id: "second", isGM: true, active: false, query: vi.fn() };
  const player = { id: "player", isGM: false, active: false, query: vi.fn() };
  const users = [gm, second, player];
  const game = { user: gm, users: { activeGM: gm, contents: users, get: (id: string) => users.find(user => user.id === id) },
    scenes: { get: (id: string) => id === "scene" ? scene : undefined, [Symbol.iterator]: function* () { yield scene; } },
    items: { get: (id: string) => id === "poi" ? item : undefined }, actors: { get: (id: string) => id === "a1" ? actor : id === "a2" ? otherActor : undefined },
    i18n: { localize: (key: string) => key } };
  vi.stubGlobal("game", game);
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OWNER: 3 } });
  vi.stubGlobal("CONFIG", { queries: {} });
  return { flags, sceneFlags, region, regions, scene, item, actor, otherActor, gm, second, player, game };
}

afterEach(() => vi.unstubAllGlobals());

describe("POI runtime ownership", () => {
  it("adds valid Region membership once, retains it after unlink, and refuses removal while linked", async () => {
    const f = world();
    await reconcileScenePoiMembership();
    expect(f.sceneFlags.pointOfInterestItems).toEqual(["Item.poi"]);
    await reconcileScenePoiMembership();
    expect(f.scene.update).toHaveBeenCalledOnce();
    expect(await mutatePoi({ action: "remove", sceneId: "scene", itemUuid: "Item.poi" }))
      .toEqual({ ok: false, reason: "linked" });
    f.regions.length = 0;
    expect(f.sceneFlags.pointOfInterestItems).toEqual(["Item.poi"]);
    expect(await mutatePoi({ action: "remove", sceneId: "scene", itemUuid: "Item.poi" }))
      .toEqual({ ok: true });
    expect(f.sceneFlags.pointOfInterestItems).toEqual([]);
  });

  it("does not run automatic reconciliation on the second GM", async () => {
    const f = world(); f.game.user = f.second;
    await reconcileScenePoiMembership();
    expect(f.scene.update).not.toHaveBeenCalled();
  });

  it("forwards a second GM mutation and rejects a player using the same query", async () => {
    const f = world();
    registerPoiRuntimeQueries();
    const handler = (CONFIG as typeof CONFIG & { queries: Record<string, (data: unknown, context: unknown) => Promise<unknown>> }).queries[POI_MUTATION_QUERY];
    f.gm.query.mockImplementation((name: string, data: unknown) => {
      expect(name).toBe(POI_MUTATION_QUERY);
      const requester = f.game.user;
      (f.game as { user: unknown }).user = f.gm;
      return handler(data, { user: requester });
    });
    f.game.user = f.second;
    expect(await mutatePoi({ action: "add", sceneId: "scene", itemUuid: "Item.poi" })).toEqual({ ok: true });
    expect(f.sceneFlags.pointOfInterestItems).toEqual(["Item.poi"]);
    expect(f.scene.update).toHaveBeenCalledOnce();
    expect(await handler({ action: "visibility", sceneId: "scene", itemUuid: "Item.poi", mode: "everyone", users: [], userId: "gm" }, { user: f.player }))
      .toEqual({ ok: false, reason: "forbidden" });
    expect(f.item.update).not.toHaveBeenCalled();
  });

  it("keeps visibility and knowledge on the Item, independently per Agent", async () => {
    const f = world();
    await mutatePoi({ action: "add", sceneId: "scene", itemUuid: "Item.poi" });
    await mutatePoi({ action: "visibility", sceneId: "scene", itemUuid: "Item.poi", mode: "users", users: ["player"] });
    expect(f.flags.pointOfInterestVisibility).toEqual({ mode: "users", users: ["player"], notified: ["player"] });
    await mutatePoi({ action: "knowledge", sceneId: "scene", itemUuid: "Item.poi", informationId: "clue", actorUuids: ["Actor.a1"] });
    expect(f.flags.pointOfInterestKnowledge).toEqual({ agents: [{ actorUuid: "Actor.a1", informationIds: ["clue"] }] });
    expect(resolvePoiScene("scene", f.player as unknown as foundry.documents.User)).toEqual({ entries: [{ itemUuid: "Item.poi", name: "Armário", img: "icon.svg", linkedRegionIds: [] }] });
    expect(f.sceneFlags).toEqual({ pointOfInterestItems: ["Item.poi"] });
  });

  it("forwards visibility and knowledge from a second GM to the active GM", async () => {
    const f = world();
    registerPoiRuntimeQueries();
    const handler = (CONFIG as typeof CONFIG & { queries: Record<string, (data: unknown, context: unknown) => Promise<unknown>> }).queries[POI_MUTATION_QUERY];
    await mutatePoi({ action: "add", sceneId: "scene", itemUuid: "Item.poi" });
    f.gm.query.mockImplementation(async (_name: string, data: unknown) => {
      f.game.user = f.gm;
      const result = await handler(data, { user: f.second });
      f.game.user = f.second;
      return result;
    });
    f.game.user = f.second;
    expect(await mutatePoi({ action: "visibility", sceneId: "scene", itemUuid: "Item.poi", mode: "everyone", users: [] }))
      .toEqual({ ok: true });
    expect(await mutatePoi({ action: "knowledge", sceneId: "scene", itemUuid: "Item.poi", informationId: "clue", actorUuids: ["Actor.a1"] }))
      .toEqual({ ok: true });
    expect(f.gm.query).toHaveBeenCalledTimes(2);
    expect(f.item.update).toHaveBeenCalledTimes(2);
  });

  it("records knowledge separately and idempotently for each World Agent", async () => {
    const f = world();
    await mutatePoi({ action: "add", sceneId: "scene", itemUuid: "Item.poi" });
    const reveal = (actorUuids: string[]) => mutatePoi({ action: "knowledge", sceneId: "scene", itemUuid: "Item.poi", informationId: "clue", actorUuids });
    await reveal(["Actor.a1"]);
    await reveal(["Actor.a1"]);
    expect(f.item.update).toHaveBeenCalledOnce();
    await reveal(["Actor.a2"]);
    expect(f.flags.pointOfInterestKnowledge).toEqual({ agents: [
      { actorUuid: "Actor.a1", informationIds: ["clue"] },
      { actorUuid: "Actor.a2", informationIds: ["clue"] },
    ] });
  });

  it("invalidates other clients only after a successful write", async () => {
    const f = world();
    f.player.active = true;
    f.scene.update.mockRejectedValueOnce(new Error("write failed"));
    await expect(mutatePoi({ action: "add", sceneId: "scene", itemUuid: "Item.poi" })).rejects.toThrow("write failed");
    expect(f.player.query).not.toHaveBeenCalled();
    expect(await mutatePoi({ action: "add", sceneId: "scene", itemUuid: "Item.poi" })).toEqual({ ok: true });
    expect(f.player.query).toHaveBeenCalledOnce();
    await mutatePoi({ action: "add", sceneId: "scene", itemUuid: "Item.poi" });
    expect(f.player.query).toHaveBeenCalledOnce();
  });
});
