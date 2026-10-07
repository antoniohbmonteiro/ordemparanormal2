import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(), execute: vi.fn(), publish: vi.fn(), pay: vi.fn(), prepare: vi.fn(),
}));
vi.mock("../../adapters/foundry/actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: mocks.resolve }));
vi.mock("../../adapters/foundry/actors/read-agent-check-source", () => ({ readAgentCheckSource: () => ({ skills: { crime: 6 } }) }));
vi.mock("../../adapters/foundry/abilities/read-agent-check-abilities", () => ({ readAgentCheckAbilities: (actor: { system: { resources: { health: { value: number } } } }) => ({
  health: actor.system.resources.health.value, determination: 0, abilities: [],
}) }));
vi.mock("../../adapters/foundry/abilities/ability-use-cost-payment", () => ({
  enqueueActorAbilityCostOperation: (_actor: unknown, operation: () => Promise<unknown>) => operation(),
  payAbilityUseCostPlan: mocks.pay,
}));
vi.mock("../../adapters/foundry/dice/execute-foundry-check", () => ({ executeFoundryCheck: mocks.execute }));
vi.mock("../../adapters/foundry/chat/publish-check-message", () => ({
  isRegisteredMessageMode: () => true, publishCheckMessage: mocks.publish,
}));
vi.mock("../checks/resolve-agent-check-interaction", () => ({
  isAgentCheckChoices: () => true, prepareAgentCheckExecution: mocks.prepare,
}));

let service: typeof import("./access-challenge-service");
const player = { id: "player", active: true, isGM: false };
const gm = { id: "gm", active: true, isGM: true };
const actor = { name: "Agent", img: "agent.png", system: { resources: { health: { value: 3 } } },
  testUserPermission: vi.fn(() => true) };

beforeAll(async () => {
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, contents: [player], get: (id: string) => id === "player" ? player : gm },
    i18n: { localize: (key: string) => key } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  mocks.resolve.mockResolvedValue(actor);
  mocks.prepare.mockReturnValue({ selectedInput: {}, preparedAbilityUses: { applied: [] }, effectiveInput: { components: [] } });
  mocks.execute.mockResolvedValue({ result: { total: 10, components: [{ result: 4 }, { result: 6 }], extraDice: [{ result: 8 }] }, roll: {} });
  mocks.pay.mockImplementation(async (_actor, plan: { health: { remaining: number } }) => { actor.system.resources.health.value = plan.health.remaining; });
  mocks.publish.mockRejectedValue(new Error("Chat unavailable"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  service = await import("./access-challenge-service");
});

beforeEach(() => {
  vi.clearAllMocks();
  actor.system.resources.health.value = 3;
  actor.testUserPermission.mockReturnValue(true);
});

describe("Access Challenge authority", () => {
  it("keeps independent Actor and synthetic Token sessions with their participant references", async () => {
    const actorRef = { kind: "actor" as const, uuid: "Actor.agent" as const };
    const tokenRef = { kind: "token" as const, uuid: "Scene.scene.Token.synthetic" as const };
    const unlock = await service.createUnlockChallenge({ participant: actorRef, obstacle: "",
      diceCount: 3, die: 6, resistance: 2, secretMode: "manual", manualSecret: [3, 5, 2] });
    const breaking = await service.createBreakChallenge({ participant: tokenRef,
      obstacle: "Porta", difficulty: 7, pa: 10 });
    expect(unlock.participant).toEqual(actorRef);
    expect(breaking.participant).toEqual(tokenRef);
    expect(unlock.id).not.toBe(breaking.id);
    expect(service.activeAccessChallenges()).toContainEqual(unlock);
    expect(service.activeAccessChallenges()).toContainEqual(breaking);
    expect(mocks.resolve).toHaveBeenCalledWith(actorRef);
    expect(mocks.resolve).toHaveBeenCalledWith(tokenRef);
  });

  it("commits cost and session before chat, then rejects retry after publication failure", async () => {
    const breaking = await service.createBreakChallenge({ participant: { kind: "token", uuid: "Scene.scene.Token.synthetic" },
      obstacle: "Porta", difficulty: 7, pa: 10 });
    const action = { kind: "break" as const, id: breaking.id, revision: 0, choices: { difficulty: 7 }, messageMode: "publicroll" };
    const result = await service.submitPlayerAction(action, player as never);
    expect(result).toMatchObject({ status: "ok", chatPublished: false, projection: { remaining: 2, revision: 1 } });
    expect(actor.system.resources.health.value).toBe(2);
    expect(service.gmAccessChallenge(breaking.id)).toMatchObject({ revision: 1,
      state: { accumulatedRA: 8, history: [{ number: 1, outcome: "success", addedRA: 8, remaining: 2 }] } });
    const retry = await service.submitPlayerAction(action, player as never);
    expect(retry.status).toBe("stale");
    expect(actor.system.resources.health.value).toBe(2);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.pay).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("creates sessions without an online owner and authorizes each command against current ownership", async () => {
    const reference = { kind: "actor" as const, uuid: "Actor.agent" as const };
    actor.testUserPermission.mockReturnValue(false);
    const session = await service.createUnlockChallenge({ participant: reference, obstacle: "",
      diceCount: 1, die: 4, resistance: 1, secretMode: "manual", manualSecret: [1] });
    await expect(service.createBreakChallenge({ participant: reference, obstacle: "Porta", difficulty: 7, pa: 10 })).resolves.toMatchObject({ type: "break" });
    expect(service.activeAccessChallenges()).toContainEqual(session);
    expect(await service.submitPlayerAction({ kind: "guess", id: session.id, revision: 0, guess: [1] }, player as never))
      .toEqual({ status: "forbidden" });
    actor.testUserPermission.mockReturnValue(true);
    await service.cancelAccessChallenge(session.id);
    expect(service.activeAccessChallenges().some(candidate => candidate.id === session.id)).toBe(false);
    expect(service.gmAccessChallenge(session.id)?.state.status).toBe("cancelled");
  });

  it("serializes simultaneous commands from different owners so the same revision is consumed only once", async () => {
    const session = await service.createUnlockChallenge({ participant: { kind: "token", uuid: "Scene.scene.Token.synthetic" },
      obstacle: "", diceCount: 1, die: 6, resistance: 3, secretMode: "manual", manualSecret: [3] });
    const action = { kind: "guess" as const, id: session.id, revision: 0, guess: [4] };
    const results = await Promise.all([
      service.submitPlayerAction(action, player as never),
      service.submitPlayerAction(action, { ...player, id: "second-owner" } as never),
    ]);
    expect(results.map(result => result.status)).toEqual(["ok", "stale"]);
    expect(service.gmAccessChallenge(session.id)).toMatchObject({ revision: 1, state: { attemptsUsed: 1, history: [{ number: 1 }] } });
    expect(await service.submitPlayerAction({ ...action, revision: 1 }, { ...player, active: false } as never)).toEqual({ status: "forbidden" });
    expect(await service.submitPlayerAction({ ...action, revision: 1 }, gm as never)).toEqual({ status: "forbidden" });
  });

  it("charges 1 PV on a failed confirmed Check, grants no RA, and blocks an attempt at 0 PV", async () => {
    actor.system.resources.health.value = 1;
    mocks.execute.mockResolvedValueOnce({ result: { total: 3, components: [{ result: 1 }, { result: 2 }], extraDice: [] }, roll: {} });
    const session = await service.createBreakChallenge({ participant: { kind: "actor", uuid: "Actor.agent" },
      obstacle: "Porta", difficulty: 7, pa: 10 });
    const action = { kind: "break" as const, id: session.id, revision: 0, choices: { difficulty: 7 }, messageMode: "publicroll" };
    const failed = await service.submitPlayerAction(action, player as never);
    expect(failed).toMatchObject({ status: "ok", projection: { remaining: 10, latest: { outcome: "failure", addedRA: 0 } } });
    expect(actor.system.resources.health.value).toBe(0);
    const executionCount = mocks.execute.mock.calls.length;
    const paymentCount = mocks.pay.mock.calls.length;
    expect(await service.submitPlayerAction({ ...action, revision: 1 }, player as never)).toEqual({ status: "invalid" });
    expect(mocks.execute).toHaveBeenCalledTimes(executionCount);
    expect(mocks.pay).toHaveBeenCalledTimes(paymentCount);
  });

  it("keeps the creator authoritative if activeGM changes after session creation", async () => {
    const session = await service.createUnlockChallenge({ participant: { kind: "actor", uuid: "Actor.agent" },
      obstacle: "", diceCount: 1, die: 4,
      resistance: 1, secretMode: "manual", manualSecret: [3] });
    const users = game.users as unknown as { activeGM: { id: string } };
    users.activeGM = { id: "other" };
    try {
      const result = await service.submitPlayerAction({ kind: "guess", id: session.id, revision: 0, guess: [3] }, player as never);
      expect(result).toMatchObject({ status: "ok", projection: { gmUserId: "gm", status: "success" } });
    } finally { users.activeGM = gm; }
  });
});
