import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createUnlockState } from "../../../core/access-challenges/unlock";
import type { AccessChallengeSession } from "../../../application/access-challenges/session";
import { ACCESS_CLOSE_QUERY, ACCESS_PRESENT_QUERY, ACCESS_UPDATE_QUERY, closeChallengeForPlayers,
  dispatchChallengeAction, presentChallengeToPlayers, updateChallengeForPlayers } from "./query-transport";

const { resolve } = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("../actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: resolve }));

const session: AccessChallengeSession = { id: "s", gmUserId: "creator",
  participant: { kind: "token", uuid: "Scene.scene.Token.synthetic" }, participantName: "Agent", participantImg: "img",
  obstacle: "", revision: 0, type: "unlock", state: createUnlockState([3, 5, 2], 6, 3, 6) };
const owner = { id: "owner", active: true, isGM: false, query: vi.fn(async () => true) };
const second = { id: "second", active: true, isGM: false, query: vi.fn(async () => true) };
const offline = { id: "offline", active: false, isGM: false, query: vi.fn(async () => true) };
const observer = { id: "observer", active: true, isGM: false, query: vi.fn(async () => true) };
const creator = { id: "creator", active: true, isGM: true, query: vi.fn(async () => ({ status: "invalid" })) };
const otherGm = { id: "other", active: true, isGM: true, query: vi.fn(async () => true) };
const permission = vi.fn((user: { id: string }) => ["owner", "second", "offline"].includes(user.id));

beforeEach(() => {
  vi.clearAllMocks();
  permission.mockImplementation(user => ["owner", "second", "offline"].includes(user.id));
  const users = [owner, second, offline, observer, creator, otherGm];
  vi.stubGlobal("game", { users: { contents: users, activeGM: otherGm, get: (id: string) => users.find(user => user.id === id) } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  resolve.mockResolvedValue({ testUserPermission: permission });
});
afterEach(() => vi.unstubAllGlobals());

it("presents a secret-free projection to every active non-GM OWNER of the effective Token Actor", async () => {
  await presentChallengeToPlayers(session);
  expect(resolve).toHaveBeenCalledWith(session.participant);
  for (const user of [owner, second]) {
    expect(user.query).toHaveBeenCalledWith(ACCESS_PRESENT_QUERY, expect.objectContaining({ participant: session.participant }), { timeout: 10000 });
    expect(JSON.stringify(user.query.mock.calls)).not.toContain('"secret"');
    expect(JSON.stringify(user.query.mock.calls)).not.toContain('"history"');
  }
  for (const user of [offline, observer, creator, otherGm]) expect(user.query).not.toHaveBeenCalled();
});

it("routes actions to the fixed creator, regardless of activeGM", async () => {
  await dispatchChallengeAction(session.gmUserId, { kind: "guess", id: "s", revision: 0, guess: [4, 5, 1] });
  expect(creator.query).toHaveBeenCalledOnce();
  expect(otherGm.query).not.toHaveBeenCalled();
});

it("permits presentation without owners and resolves ownership again on a later open", async () => {
  permission.mockReturnValue(false);
  await expect(presentChallengeToPlayers(session)).resolves.toBeUndefined();
  expect(owner.query).not.toHaveBeenCalled();
  permission.mockImplementation(user => user.id === "owner");
  await presentChallengeToPlayers(session);
  expect(owner.query).toHaveBeenCalledOnce();
  expect(second.query).not.toHaveBeenCalled();
});

it("uses the update-only query after attempts without reopening closed presentations", async () => {
  await updateChallengeForPlayers(session);
  expect(owner.query).toHaveBeenCalledWith(ACCESS_UPDATE_QUERY, expect.any(Object), { timeout: 3000 });
});

it("closes matching presentations on cancellation even for a player whose ownership was revoked", async () => {
  permission.mockReturnValue(false);
  await closeChallengeForPlayers(session);
  for (const user of [owner, second, observer]) expect(user.query).toHaveBeenCalledWith(ACCESS_CLOSE_QUERY,
    { id: session.id, gmUserId: session.gmUserId }, { timeout: 5000 });
  for (const user of [offline, creator, otherGm]) expect(user.query).not.toHaveBeenCalled();
});

it("continues sending to the other owners if one presentation fails", async () => {
  owner.query.mockRejectedValueOnce(new Error("Unavailable"));
  await expect(presentChallengeToPlayers(session)).rejects.toThrow();
  expect(second.query).toHaveBeenCalledOnce();
});
