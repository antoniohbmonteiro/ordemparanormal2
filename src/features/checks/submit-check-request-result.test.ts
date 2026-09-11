import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckRequestStateV1 } from "../../application/checks/check-request-state";
import type { CheckSnapshotV3 } from "../../application/checks/check-snapshot";

const mocks = vi.hoisted(() => ({
  canRoll: vi.fn(),
  resolveParticipant: vi.fn(),
  render: vi.fn(),
  accent: vi.fn(),
}));

vi.mock("../../adapters/foundry/actors/agent-check-permission", () => ({ canUserRollActor: mocks.canRoll }));
vi.mock("../../adapters/foundry/actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: mocks.resolveParticipant }));
vi.mock("../../adapters/foundry/actors/read-agent-accent-color", () => ({ readAgentAccentColor: mocks.accent }));
vi.mock("../../adapters/foundry/chat/render-check-card-content", () => ({ renderCheckCardContent: mocks.render }));

import { parseSubmitCheckRequestResultData, submitCheckRequestResult } from "./submit-check-request-result";

const result: CheckSnapshotV3 = {
  schemaVersion: 3,
  check: { kind: "skill", key: "fighting", name: "Luta" },
  components: [
    { kind: "attribute", key: "mind", label: "Mente", die: 8, result: 5 },
    { kind: "skill", key: "fighting", label: "Luta", die: 6, result: 4 },
  ],
  extraDice: [],
  total: 9,
  difficulty: 9,
  outcome: "success",
};

function createState(): CheckRequestStateV1 {
  return {
    schemaVersion: 1,
    status: "pending",
    participant: { kind: "actor", uuid: "Actor.agent" },
    selection: { kind: "skill", key: "fighting" },
    difficulty: 9,
    presentation: { actorName: "Agente", requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
  };
}

describe("submit Check Request result", () => {
  const activeGM = { id: "gm", isGM: true } as foundry.documents.User;
  const sender = { id: "player", isGM: false } as foundry.documents.User;
  const canonicalSender = { id: "player", isGM: false } as foundry.documents.User;
  let requestState: CheckRequestStateV1;
  let check: CheckSnapshotV3 | undefined;
  let update: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    requestState = createState();
    check = undefined;
    update = vi.fn(async (changes: Record<string, unknown>) => {
      requestState = (changes["flags.ordemparanormal2.checkRequest"] ?? requestState) as CheckRequestStateV1;
      check = (changes["flags.ordemparanormal2.check"] ?? check) as CheckSnapshotV3;
    });
    const message = {
      getFlag: (_scope: string, key: string) => key === "checkRequest" ? requestState : check,
      update,
    } as unknown as ChatMessage;
    vi.stubGlobal("game", {
      user: activeGM,
      users: { activeGM, get: vi.fn((id: string) => id === "player" ? canonicalSender : activeGM) },
      messages: { get: vi.fn(() => message) },
    });
    mocks.resolveParticipant.mockResolvedValue({});
    mocks.canRoll.mockReturnValue(true);
    mocks.render.mockResolvedValue("<article>resolved</article>");
    mocks.accent.mockReturnValue("#4176BA");
  });

  it("rejects forged identity fields", () => {
    expect(parseSubmitCheckRequestResultData({ messageId: "m", result, userId: "forged" })).toBeNull();
  });

  it("updates content and both lifecycle flags in the same message", async () => {
    await submitCheckRequestResult({ messageId: "m", result }, sender);
    expect(mocks.canRoll).toHaveBeenCalledWith({}, canonicalSender);
    expect(update).toHaveBeenCalledExactlyOnceWith({
      content: "<article>resolved</article>",
      "flags.ordemparanormal2.checkRequest": { ...createState(), status: "resolved" },
      "flags.ordemparanormal2.check": result,
      "flags.ordemparanormal2.checkPresentation": { accentColor: "#4176BA" },
    });
  });

  it("rejects a non-owner", async () => {
    mocks.canRoll.mockReturnValue(false);
    await expect(submitCheckRequestResult({ messageId: "m", result }, sender)).rejects.toThrow("cannot roll");
    expect(update).not.toHaveBeenCalled();
  });

  it("serializes competing submissions so only the first persists", async () => {
    const submissions = await Promise.allSettled([
      submitCheckRequestResult({ messageId: "m", result }, sender),
      submitCheckRequestResult({ messageId: "m", result }, sender),
    ]);
    expect(submissions.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(update).toHaveBeenCalledOnce();
  });
});
