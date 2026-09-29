import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { canUserRollActor } = vi.hoisted(() => ({
  canUserRollActor: vi.fn(),
}));
vi.mock("../actors/agent-check-permission", () => ({ canUserRollActor }));

import { resolveInvestigationAgent, resolveSceneInvestigationAgent } from "./resolve-investigation-agent";

const user = { isGM: false, character: null } as foundry.documents.User;
const agent = (id: string) => ({ id, type: "agent" }) as foundry.documents.Actor;
const other = { id: "other", type: "other" } as foundry.documents.Actor;

beforeEach(() => {
  vi.clearAllMocks();
  canUserRollActor.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("resolve Investigation Agent", () => {
  it("chooses the single rollable controlled Agent", () => {
    const selected = agent("selected");
    expect(resolveInvestigationAgent([{ actor: selected }], user))
      .toEqual({ ok: true, actor: selected });
  });

  it("rejects multiple controlled Agents instead of choosing one", () => {
    expect(resolveInvestigationAgent([
      { actor: agent("a") },
      { actor: agent("b") },
    ], user)).toEqual({ ok: false, reason: "multiple" });
  });

  it("falls back to the user's rollable Agent character", () => {
    const character = agent("character");
    const characterUser = { ...user, character } as unknown as foundry.documents.User;
    expect(resolveInvestigationAgent([{ actor: other }], characterUser))
      .toEqual({ ok: true, actor: character });
  });

  it("returns none without a controlled or configured rollable Agent", () => {
    canUserRollActor.mockReturnValue(false);
    const characterUser = {
      ...user,
      character: agent("character"),
    } as unknown as foundry.documents.User;
    expect(resolveInvestigationAgent([], characterUser))
      .toEqual({ ok: false, reason: "none" });
  });
});

it("requires an owned World Agent represented by a linked Token in the Scene", () => {
  const actor = { id: "a", uuid: "Actor.a", type: "agent", testUserPermission: vi.fn(() => true) };
  const player = { id: "player", isGM: false, character: actor };
  const scene = { tokens: [{ actorId: "a", actorLink: true }] };
  vi.stubGlobal("game", { user: player, scenes: { get: () => scene }, actors: { get: () => actor } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  vi.stubGlobal("canvas", { tokens: { controlled: [] } });
  expect(resolveSceneInvestigationAgent("scene")).toBe(actor);
  actor.testUserPermission.mockReturnValue(false);
  expect(resolveSceneInvestigationAgent("scene")).toBeNull();
});
