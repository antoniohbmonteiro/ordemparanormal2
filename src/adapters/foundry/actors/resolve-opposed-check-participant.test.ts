import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveOpposedCheckParticipant } from "./resolve-opposed-check-participant";

class MockActor {
  constructor(readonly type = "agent") {}
}

class MockTokenDocument {
  constructor(readonly actor: MockActor | null, readonly baseActor?: MockActor) {}
}

beforeEach(() => {
  vi.stubGlobal("Actor", MockActor);
  vi.stubGlobal("foundry", { documents: { TokenDocument: MockTokenDocument } });
});

afterEach(() => vi.unstubAllGlobals());

describe("resolve Opposed Check participant", () => {
  it("resolves a canonical World Actor", async () => {
    const actor = new MockActor();
    vi.stubGlobal("fromUuid", vi.fn().mockResolvedValue(actor));
    await expect(resolveOpposedCheckParticipant({ kind: "actor", uuid: "Actor.agent" })).resolves.toBe(actor);
  });

  it("uses token.actor for an unlinked Token and never its baseActor", async () => {
    const synthetic = new MockActor();
    const base = new MockActor();
    vi.stubGlobal("fromUuid", vi.fn().mockResolvedValue(new MockTokenDocument(synthetic, base)));
    await expect(resolveOpposedCheckParticipant({ kind: "token", uuid: "Scene.scene.Token.token" })).resolves.toBe(synthetic);
  });

  it("fails safely when a reference no longer resolves", async () => {
    vi.stubGlobal("fromUuid", vi.fn().mockResolvedValue(null));
    await expect(resolveOpposedCheckParticipant({ kind: "token", uuid: "Scene.scene.Token.deleted" })).resolves.toBeNull();
  });
});
