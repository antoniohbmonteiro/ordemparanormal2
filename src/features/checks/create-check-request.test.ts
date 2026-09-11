import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  resolve: vi.fn(),
  readSource: vi.fn(),
  createMessage: vi.fn(),
  accent: vi.fn(),
}));

vi.mock("../../application/checks/build-agent-check", () => ({ buildAgentCheck: mocks.build }));
vi.mock("../../adapters/foundry/actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: mocks.resolve }));
vi.mock("../../adapters/foundry/actors/read-agent-check-source", () => ({ readAgentCheckSource: mocks.readSource }));
vi.mock("../../adapters/foundry/chat/create-check-request-message", () => ({ createCheckRequestMessage: mocks.createMessage }));
vi.mock("../../adapters/foundry/actors/read-agent-accent-color", () => ({ readAgentAccentColor: mocks.accent }));

import { createCheckRequest } from "./create-check-request";

const configuration = {
  participant: { kind: "actor" as const, uuid: "Actor.agent" as const },
  selection: { kind: "skill" as const, key: "fighting" as const },
  difficulty: 12,
};

describe("create Check Request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("game", { user: { isGM: true }, i18n: { localize: (key: string) => key } });
    mocks.resolve.mockResolvedValue({ name: "Agente", img: "agent.webp" });
    mocks.readSource.mockReturnValue({});
    mocks.build.mockReturnValue({
      check: { name: "Luta" },
      components: [{ label: "Físico" }, { label: "Luta" }],
    });
    mocks.accent.mockReturnValue("#4176BA");
    mocks.createMessage.mockResolvedValue({ id: "message" });
  });

  it("creates one pending skill request with presentation provenance", async () => {
    await createCheckRequest(configuration);
    expect(mocks.createMessage).toHaveBeenCalledExactlyOnceWith(
      { name: "Agente", img: "agent.webp" },
      {
        schemaVersion: 1,
        status: "pending",
        participant: configuration.participant,
        selection: configuration.selection,
        difficulty: 12,
        presentation: {
          actorName: "Agente",
          actorImg: "agent.webp",
          requestedCheckLabel: "Luta",
          requestedCheckContext: "Físico + Luta",
        },
      },
      "#4176BA",
    );
  });

  it("revalidates GM authority before resolving the participant", async () => {
    vi.stubGlobal("game", { user: { isGM: false } });
    await expect(createCheckRequest(configuration)).rejects.toThrow("Only a GM");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
