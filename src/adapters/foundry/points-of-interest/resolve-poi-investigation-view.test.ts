import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePoiInvestigationView } from "./resolve-poi-investigation-view";

const fromUuid = vi.fn();
// Mirrors Foundry: empty/blank content enriches to an empty string.
const enrichHTML = vi.fn(async (html: string) => (html ? `enriched:${html}` : ""));

function region(flags: { association?: unknown; reveal?: unknown }) {
  return {
    getFlag: vi.fn((_scope: string, key: string) =>
      key === "pointOfInterestReveal" ? flags.reveal : flags.association),
  };
}

function stubWorld(sceneRegion: unknown, users: Record<string, { isGM: boolean }> = {}) {
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
    scenes: { get: () => (sceneRegion === "no-scene" ? undefined : { regions: { get: () => sceneRegion } }) },
    users: { get: (id: string) => users[id] },
  });
}

const REVEALED = { association: { itemUuid: "Item.poi" }, reveal: { mode: "everyone" } };
const PLAYER = "p1";
const req = (requesterUserId = PLAYER) => ({ sceneId: "s", regionId: "r", requesterUserId });

beforeEach(() => {
  fromUuid.mockReset().mockResolvedValue({
    type: "pointOfInterest",
    name: "Armário Azul",
    img: "icons/svg/eye.svg",
    system: {
      publicDescription: "<p>Um armário metálico.</p>",
      gmContext: "SEGREDO DO MESTRE",
      information: [
        { id: "1", skill: "perception", difficulty: 6, showDifficultyToPlayers: true, content: "PISTA SECRETA" },
        { id: "2", skill: "technology", difficulty: 2, content: "OUTRA PISTA" },
        { id: "3", skill: "perception", difficulty: 9, content: "MAIS" },
      ],
    },
  });
  enrichHTML.mockClear();
  vi.stubGlobal("fromUuid", fromUuid);
  vi.stubGlobal("foundry", {
    applications: { ux: { TextEditor: { implementation: { enrichHTML } } } },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("resolvePoiInvestigationView", () => {
  it("is unavailable with no Scene, no Region, no association, or a wrong Item type", async () => {
    stubWorld("no-scene");
    expect(await resolvePoiInvestigationView(req())).toEqual({ error: "unavailable" });

    stubWorld(null);
    expect(await resolvePoiInvestigationView(req())).toEqual({ error: "unavailable" });

    stubWorld(region({ association: undefined }));
    expect(await resolvePoiInvestigationView(req())).toEqual({ error: "unavailable" });

    stubWorld(region(REVEALED));
    fromUuid.mockResolvedValue({ type: "weapon" });
    expect(await resolvePoiInvestigationView(req())).toEqual({ error: "unavailable" });
  });

  it("forbids a non-GM the POI is not revealed to, before resolving the Item", async () => {
    stubWorld(region({ association: { itemUuid: "Item.poi" }, reveal: { mode: "hidden" } }));
    expect(await resolvePoiInvestigationView(req())).toEqual({ error: "forbidden" });

    stubWorld(region({ association: { itemUuid: "Item.poi" }, reveal: { mode: "users", users: ["p2"] } }));
    expect(await resolvePoiInvestigationView(req())).toEqual({ error: "forbidden" });

    expect(fromUuid).not.toHaveBeenCalled();
  });

  it("builds the projection for a revealed player and for a GM regardless of reveal", async () => {
    stubWorld(region(REVEALED));
    expect(await resolvePoiInvestigationView(req())).toEqual({
      view: {
        name: "Armário Azul",
        description: "enriched:<p>Um armário metálico.</p>",
        img: "icons/svg/eye.svg",
        skills: [{ key: "perception", name: "Percepção", difficulties: [6], hasHiddenDifficulties: true }, { key: "technology", name: "Tecnologia", difficulties: [], hasHiddenDifficulties: true }],
      },
    });

    stubWorld(region({ association: { itemUuid: "Item.poi" }, reveal: { mode: "hidden" } }), { gm1: { isGM: true } });
    const asGm = await resolvePoiInvestigationView(req("gm1"));
    expect("view" in asGm && asGm.view.skills.map(s => s.name)).toEqual(["Percepção", "Tecnologia"]);
  });

  it("never leaks gmContext, information content or ids, or the raw Item", async () => {
    stubWorld(region(REVEALED));
    const result = await resolvePoiInvestigationView(req());
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SEGREDO DO MESTRE");
    expect(serialized).not.toContain("PISTA SECRETA");
    expect(serialized).not.toContain('"id"');
    expect(serialized).not.toContain('"system"');
    expect("view" in result && Object.keys(result.view).sort()).toEqual(["description", "img", "name", "skills"]);
  });

  it("enriches the description with secrets disabled", async () => {
    stubWorld(region(REVEALED));
    await resolvePoiInvestigationView(req());
    expect(enrichHTML).toHaveBeenCalledWith(
      "<p>Um armário metálico.</p>",
      expect.objectContaining({ secrets: false }),
    );
  });

  it("returns a non-empty description when publicDescription is set", async () => {
    fromUuid.mockResolvedValue({
      type: "pointOfInterest",
      name: "Armário Azul",
      system: { publicDescription: "Descrição de teste", information: [] },
    });
    stubWorld(region(REVEALED));
    const result = await resolvePoiInvestigationView(req());
    expect("view" in result && result.view.description).toBe("enriched:Descrição de teste");
  });

  it("returns an empty description when publicDescription is blank (no domain fix)", async () => {
    fromUuid.mockResolvedValue({
      type: "pointOfInterest",
      name: "Armário Azul",
      system: { publicDescription: "", information: [] },
    });
    stubWorld(region(REVEALED));
    const result = await resolvePoiInvestigationView(req());
    expect("view" in result && result.view).toEqual({
      name: "Armário Azul", description: "", img: "", skills: [],
    });
  });
});

it.each(["revoke", "reassociate", "delete"])("rechecks placement after asynchronous enrichment: %s", async change => {
  const flags = { association: { itemUuid: "Item.poi" }, reveal: { mode: "everyone" } };
  stubWorld(region(flags));
  enrichHTML.mockImplementationOnce(async () => {
    if (change === "revoke") flags.reveal.mode = "hidden";
    if (change === "reassociate") flags.association.itemUuid = "Item.other";
    if (change === "delete") stubWorld(null);
    return "Public";
  });
  expect(await resolvePoiInvestigationView(req())).toEqual({ error: change === "revoke" ? "forbidden" : "unavailable" });
});


it("derives deduplicated skills from information, with per-entry public DTs and one hidden indicator", async () => {
  stubWorld(region(REVEALED));
  fromUuid.mockResolvedValue({ type: "pointOfInterest", name: "POI", system: {
    information: [
      { id: "a", skill: "perception", difficulty: 8, showDifficultyToPlayers: true, content: "private" },
      { id: "b", skill: "perception", difficulty: 6, showDifficultyToPlayers: true, content: "private" },
      { id: "c", skill: "perception", difficulty: 8, showDifficultyToPlayers: true, content: "private" },
      { id: "d", skill: "perception", difficulty: 99, content: "private" },
      { id: "e", skill: "perception", difficulty: 100, content: "private" },
      { id: "f", skill: "occultism", difficulty: 1, showDifficultyToPlayers: true, content: "private" },
    ],
  } });
  const result = await resolvePoiInvestigationView(req());
  expect("view" in result && result.view.skills).toEqual([
    { key: "perception", name: "Percepção", difficulties: [6, 8], hasHiddenDifficulties: true },
    { key: "occultism", name: "Ocultismo", difficulties: [1], hasHiddenDifficulties: false },
  ]);
});
