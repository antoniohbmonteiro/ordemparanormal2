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
      skills: [
        { skill: "perception", information: [
          { id: "1", difficulty: 6, showDifficultyToPlayers: true, content: "PISTA SECRETA" },
          { id: "3", difficulty: 9, showDifficultyToPlayers: false, content: "MAIS" },
        ] },
        { skill: "technology", information: [
          { id: "2", difficulty: 2, showDifficultyToPlayers: false, content: "OUTRA PISTA" },
        ] },
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
        audience: "player",
        name: "Armário Azul",
        description: "enriched:<p>Um armário metálico.</p>",
        img: "icons/svg/eye.svg",
        skills: [
          { key: "perception", name: "Percepção", information: [
            { visibility: "public", difficulty: 6 },
            { visibility: "hidden" },
          ] },
          { key: "technology", name: "Tecnologia", information: [
            { visibility: "hidden" },
          ] },
        ],
      },
    });

    stubWorld(region({ association: { itemUuid: "Item.poi" }, reveal: { mode: "hidden" } }), { gm1: { isGM: true } });
    const asGm = await resolvePoiInvestigationView(req("gm1"));
    expect(asGm).toEqual({ view: {
      audience: "gm",
      name: "Armário Azul",
      description: "enriched:<p>Um armário metálico.</p>",
      img: "icons/svg/eye.svg",
      gmContext: "enriched:SEGREDO DO MESTRE",
      skills: [
        { key: "perception", name: "Percepção", information: [
          { difficulty: 6, content: "PISTA SECRETA" },
          { difficulty: 9, content: "MAIS" },
        ] },
        { key: "technology", name: "Tecnologia", information: [
          { difficulty: 2, content: "OUTRA PISTA" },
        ] },
      ],
    } });
  });

  it("never leaks gmContext, information content or ids, or the raw Item", async () => {
    stubWorld(region(REVEALED));
    const result = await resolvePoiInvestigationView(req());
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SEGREDO DO MESTRE");
    expect(serialized).not.toContain("PISTA SECRETA");
    expect(serialized).not.toContain('"id"');
    expect(serialized).not.toContain('"system"');
    expect("view" in result && Object.keys(result.view).sort()).toEqual(["audience", "description", "img", "name", "skills"]);
  });

  it("enriches the description with secrets disabled", async () => {
    stubWorld(region(REVEALED));
    await resolvePoiInvestigationView(req());
    expect(enrichHTML).toHaveBeenCalledWith(
      "<p>Um armário metálico.</p>",
      expect.objectContaining({ secrets: false }),
    );
  });

  it("enriches gmContext only for a GM, with secrets enabled", async () => {
    stubWorld(region(REVEALED), { gm1: { isGM: true } });
    await resolvePoiInvestigationView(req("gm1"));
    expect(enrichHTML).toHaveBeenCalledWith(
      "SEGREDO DO MESTRE",
      expect.objectContaining({ secrets: true }),
    );

    enrichHTML.mockClear();
    stubWorld(region(REVEALED));
    await resolvePoiInvestigationView(req());
    expect(enrichHTML).not.toHaveBeenCalledWith(
      "SEGREDO DO MESTRE",
      expect.anything(),
    );
  });

  it("returns a non-empty description when publicDescription is set", async () => {
    fromUuid.mockResolvedValue({
      type: "pointOfInterest",
      name: "Armário Azul",
      system: { publicDescription: "Descrição de teste", skills: [] },
    });
    stubWorld(region(REVEALED));
    const result = await resolvePoiInvestigationView(req());
    expect("view" in result && result.view.description).toBe("enriched:Descrição de teste");
  });

  it("returns an empty description when publicDescription is blank (no domain fix)", async () => {
    fromUuid.mockResolvedValue({
      type: "pointOfInterest",
      name: "Armário Azul",
      system: { publicDescription: "", skills: [] },
    });
    stubWorld(region(REVEALED));
    const result = await resolvePoiInvestigationView(req());
    expect("view" in result && result.view).toEqual({
      audience: "player", name: "Armário Azul", description: "", img: "", skills: [],
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


it("projects one sanitized row per information in canonical skill order without aggregation", async () => {
  stubWorld(region(REVEALED));
  fromUuid.mockResolvedValue({ type: "pointOfInterest", name: "POI", system: {
    skills: [
      { skill: "perception", information: [
        { id: "a", difficulty: 8, showDifficultyToPlayers: true, content: "private" },
        { id: "b", difficulty: 6, showDifficultyToPlayers: true, content: "private" },
        { id: "c", difficulty: 8, showDifficultyToPlayers: true, content: "private" },
        { id: "d", difficulty: 99, showDifficultyToPlayers: false, content: "private" },
        { id: "e", difficulty: 100, showDifficultyToPlayers: false, content: "private" },
      ] },
      { skill: "occultism", information: [
        { id: "f", difficulty: 1, showDifficultyToPlayers: true, content: "private" },
      ] },
    ],
  } });
  const result = await resolvePoiInvestigationView(req());
  const serialized = JSON.stringify(result);
  expect("view" in result && result.view.skills).toEqual([
    { key: "occultism", name: "Ocultismo", information: [
      { visibility: "public", difficulty: 1 },
    ] },
    { key: "perception", name: "Percepção", information: [
      { visibility: "public", difficulty: 8 },
      { visibility: "public", difficulty: 6 },
      { visibility: "public", difficulty: 8 },
      { visibility: "hidden" },
      { visibility: "hidden" },
    ] },
  ]);
  expect(serialized).not.toContain("99");
  expect(serialized).not.toContain("100");
  expect(serialized).not.toContain("private");
  expect(serialized).not.toContain('"id"');
});
