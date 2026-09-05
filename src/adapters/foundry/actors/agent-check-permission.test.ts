import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { canUserRollActor } from "./agent-check-permission";

beforeAll(() => {
  vi.stubGlobal("CONST", {
    DOCUMENT_OWNERSHIP_LEVELS: {
      NONE: 0,
      LIMITED: 1,
      OBSERVER: 2,
      OWNER: 3,
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function createUser(isGM: boolean): foundry.documents.User {
  return { isGM } as foundry.documents.User;
}

function createActor(permission: number): foundry.documents.Actor {
  return {
    testUserPermission: vi.fn(
      (_user: foundry.documents.User, required: number) =>
        permission >= required,
    ),
  } as unknown as foundry.documents.Actor;
}

describe("Agent check permission", () => {
  it("allows a GM without explicit ownership", () => {
    const actor = createActor(0);

    expect(canUserRollActor(actor, createUser(true))).toBe(true);
    expect(actor.testUserPermission).not.toHaveBeenCalled();
  });

  it("allows an Actor owner", () => {
    expect(canUserRollActor(createActor(3), createUser(false))).toBe(true);
  });

  it.each([
    ["none", 0],
    ["limited", 1],
    ["observer", 2],
  ])("rejects %s permission", (_name, permission) => {
    expect(
      canUserRollActor(createActor(permission), createUser(false)),
    ).toBe(false);
  });
});
