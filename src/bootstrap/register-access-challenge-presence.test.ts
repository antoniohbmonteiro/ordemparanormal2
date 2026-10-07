import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("../adapters/foundry/actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: mocks.resolve }));
vi.mock("../adapters/foundry/actors/read-agent-check-source", () => ({ readAgentCheckSource: () => ({ skills: { crime: 6 } }) }));
vi.mock("../features/checks/resolve-agent-check-interaction", () => ({ isAgentCheckChoices: () => true, prepareAgentCheckExecution: vi.fn() }));
vi.mock("../adapters/foundry/dice/execute-foundry-check", () => ({ executeFoundryCheck: vi.fn() }));
vi.mock("../adapters/foundry/chat/publish-check-message", () => ({ isRegisteredMessageMode: () => true, publishCheckMessage: vi.fn() }));

const gm = { id: "gm", active: true, isGM: true };
const otherGm = { id: "other-gm", active: true, isGM: true };
const owner = { id: "owner", active: false, isGM: false, query: vi.fn(async () => true) };
const secondOwner = { id: "second-owner", active: false, isGM: false, query: vi.fn(async () => true) };
const observer = { id: "observer", active: true, isGM: false, query: vi.fn(async () => true) };
const actor = { name: "Agente", img: "agent.png", testUserPermission: vi.fn((user: { id: string }) =>
  user.id === owner.id || user.id === secondOwner.id) };
let localGame: { user: typeof gm; users: { activeGM: typeof gm; contents: unknown[] } };
let connectedHook: (user: foundry.documents.User, connected: boolean) => Promise<void> | void;
let service: typeof import("../features/access-challenges/access-challenge-service");
let presentAll: typeof import("../adapters/foundry/access-challenges/query-transport").presentChallengeToPlayers;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  owner.active = false;
  secondOwner.active = false;
  actor.testUserPermission.mockImplementation(user => user.id === owner.id || user.id === secondOwner.id);
  localGame = { user: gm, users: { activeGM: gm, contents: [gm, otherGm, owner, secondOwner, observer] } };
  vi.stubGlobal("game", localGame);
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  vi.stubGlobal("Hooks", { on: vi.fn((name: string, callback: typeof connectedHook) => {
    expect(name).toBe("userConnected");
    connectedHook = callback;
  }) });
  mocks.resolve.mockResolvedValue(actor);
  service = await import("../features/access-challenges/access-challenge-service");
  presentAll = (await import("../adapters/foundry/access-challenges/query-transport")).presentChallengeToPlayers;
  (await import("./register-access-challenge-presence")).registerAccessChallengePresence();
});
afterEach(() => vi.unstubAllGlobals());

async function createSession(kind: "actor" | "token" = "actor") {
  return service.createUnlockChallenge({ participant: kind === "actor" ? { kind, uuid: "Actor.agent" }
    : { kind, uuid: "Scene.scene.Token.synthetic" }, obstacle: "", diceCount: 1, die: 6,
    resistance: 3, secretMode: "manual", manualSecret: [3] });
}

it("creates with no online OWNER, then presents the current session automatically only to the connecting OWNER", async () => {
  const session = await createSession("token");
  await presentAll(session);
  expect(owner.query).not.toHaveBeenCalled();
  expect(secondOwner.query).not.toHaveBeenCalled();
  const before = JSON.stringify(session);
  owner.active = true;
  secondOwner.active = true;
  await connectedHook(owner as unknown as foundry.documents.User, true);
  expect(owner.query).toHaveBeenCalledWith("ordemparanormal2.accessChallengePresent", expect.objectContaining({
    id: session.id, revision: 0, gmUserId: gm.id, participant: session.participant }), { timeout: 10000 });
  expect(secondOwner.query).not.toHaveBeenCalled();
  expect(observer.query).not.toHaveBeenCalled();
  expect(mocks.resolve).toHaveBeenCalledWith(session.participant);
  expect(actor.testUserPermission).toHaveBeenCalledWith(owner, 3);
  expect(JSON.stringify(owner.query.mock.calls)).not.toContain('"secret"');
  expect(service.gmAccessChallenge(session.id)).toBe(session);
  expect(JSON.stringify(service.gmAccessChallenge(session.id))).toBe(before);
  expect(service.activeAccessChallenges()).toHaveLength(1);
  await connectedHook(secondOwner as unknown as foundry.documents.User, true);
  expect(secondOwner.query).toHaveBeenCalledOnce();
  expect(owner.query).toHaveBeenCalledOnce();
});

it("ignores disconnects, GM connections, non-OWNERs and a local player client", async () => {
  await createSession();
  await connectedHook(owner as unknown as foundry.documents.User, false);
  await connectedHook(otherGm as unknown as foundry.documents.User, true);
  await connectedHook(observer as unknown as foundry.documents.User, true);
  owner.active = true;
  actor.testUserPermission.mockReturnValue(false);
  await connectedHook(owner as unknown as foundry.documents.User, true);
  actor.testUserPermission.mockReturnValue(true);
  localGame.user = owner;
  await connectedHook(owner as unknown as foundry.documents.User, true);
  for (const user of [owner, secondOwner, observer]) expect(user.query).not.toHaveBeenCalled();
});

it("presents only active sessions owned by the local creator, even after activeGM changes", async () => {
  const active = await createSession();
  const cancelled = await createSession();
  await service.cancelAccessChallenge(cancelled.id);
  localGame.user = otherGm;
  localGame.users.activeGM = otherGm;
  await createSession();
  localGame.user = gm;
  owner.active = true;
  await service.submitPlayerAction({ kind: "guess", id: active.id, revision: 0, guess: [4] }, owner as unknown as foundry.documents.User);
  const current = service.gmAccessChallenge(active.id);
  const before = JSON.stringify(current);
  await connectedHook(owner as unknown as foundry.documents.User, true);
  expect(owner.query).toHaveBeenCalledOnce();
  expect(owner.query).toHaveBeenCalledWith("ordemparanormal2.accessChallengePresent", expect.objectContaining({
    id: active.id, revision: 1, attemptsUsed: 1, latest: { number: 1, round: 1, guess: [4], feedback: ["low"] } }), { timeout: 10000 });
  expect(service.gmAccessChallenge(active.id)).toBe(current);
  expect(JSON.stringify(service.gmAccessChallenge(active.id))).toBe(before);
});
