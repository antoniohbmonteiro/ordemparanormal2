import { afterEach, expect, it, vi } from "vitest";
import { resolveAgentCheckParticipant } from "./resolve-agent-check-participant";

afterEach(() => vi.unstubAllGlobals());

it("resolves both a World Actor and an unlinked Scene Token's synthetic Agent", async () => {
  class AgentActor { readonly type = "agent"; }
  class TokenDocument { constructor(readonly actor: AgentActor) {} }
  const worldActor = new AgentActor();
  const syntheticActor = new AgentActor();
  vi.stubGlobal("Actor", AgentActor);
  vi.stubGlobal("foundry", { documents: { TokenDocument } });
  vi.stubGlobal("fromUuid", vi.fn(async (uuid: string) => uuid.startsWith("Actor.")
    ? worldActor : new TokenDocument(syntheticActor)));

  expect(await resolveAgentCheckParticipant({ kind: "actor", uuid: "Actor.agent" })).toBe(worldActor);
  expect(await resolveAgentCheckParticipant({ kind: "token", uuid: "Scene.scene.Token.synthetic" })).toBe(syntheticActor);
});
