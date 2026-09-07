import { beforeEach, describe, expect, it, vi } from "vitest";

const { canUserRollActor } = vi.hoisted(() => ({
  canUserRollActor: vi.fn(),
}));
vi.mock("../actors/agent-check-permission", () => ({ canUserRollActor }));

import { resolveInvestigationAgent } from "./resolve-investigation-agent";

const user = { isGM: false, character: null } as foundry.documents.User;
const agent = (id: string) => ({ id, type: "agent" }) as foundry.documents.Actor;
const other = { id: "other", type: "other" } as foundry.documents.Actor;

beforeEach(() => {
  vi.clearAllMocks();
  canUserRollActor.mockReturnValue(true);
});

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
