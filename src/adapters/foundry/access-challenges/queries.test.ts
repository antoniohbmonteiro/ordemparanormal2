import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PlayerProjection } from "../../../application/access-challenges/session";
import { ACCESS_ACTION_QUERY, ACCESS_PRESENT_QUERY, ACCESS_UPDATE_QUERY } from "./query-transport";
import { registerAccessChallengeQueries } from "./queries";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), submit: vi.fn(), session: vi.fn(),
  present: vi.fn(), update: vi.fn(), close: vi.fn(), broadcast: vi.fn() }));
vi.mock("../actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: mocks.resolve }));
vi.mock("../../../features/access-challenges/access-challenge-service", () => ({ submitPlayerAction: mocks.submit, gmAccessChallenge: mocks.session }));
vi.mock("../../../applications/access-challenges/player-view", () => ({ presentPlayerChallengeView: mocks.present,
  updatePlayerChallengeView: mocks.update, closePlayerChallengeView: mocks.close }));
vi.mock("./query-transport", () => ({ ACCESS_ACTION_QUERY: "action", ACCESS_PRESENT_QUERY: "present", ACCESS_UPDATE_QUERY: "update",
  ACCESS_CLOSE_QUERY: "close", updateChallengeForPlayers: mocks.broadcast }));

const owner = { id: "owner", active: true, isGM: false };
const gm = { id: "creator", active: true, isGM: true };
const permission = vi.fn(() => true);
let queries: Record<string, (data: unknown, context: { user: unknown }) => Promise<unknown>>;
const projection: PlayerProjection = { id: "s", gmUserId: "creator", participant: { kind: "token", uuid: "Scene.scene.Token.synthetic" },
  participantName: "Agent", participantImg: "agent.png", obstacle: "Porta", revision: 0, type: "break", difficulty: 7,
  pa: 10, remaining: 10, status: "active", latest: null };

beforeEach(() => {
  vi.clearAllMocks();
  queries = {};
  vi.stubGlobal("CONFIG", { queries });
  vi.stubGlobal("game", { user: owner });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  mocks.resolve.mockResolvedValue({ testUserPermission: permission });
  permission.mockReturnValue(true);
  mocks.broadcast.mockResolvedValue(undefined);
  registerAccessChallengeQueries();
});
afterEach(() => vi.unstubAllGlobals());

it("authenticates the GM and checks current OWNER before presenting or updating", async () => {
  expect(await queries[ACCESS_PRESENT_QUERY]!(projection, { user: gm })).toBe(true);
  expect(mocks.resolve).toHaveBeenCalledWith(projection.participant);
  expect(permission).toHaveBeenCalledWith(owner, 3);
  expect(mocks.present).toHaveBeenCalledWith(projection);
  expect(await queries[ACCESS_PRESENT_QUERY]!(projection, { user: { ...gm, id: "other" } })).toBe(false);
  permission.mockReturnValue(false);
  expect(await queries[ACCESS_UPDATE_QUERY]!(projection, { user: gm })).toBe(false);
  expect(mocks.close).toHaveBeenCalledWith("s", "creator");
  expect(mocks.update).not.toHaveBeenCalled();
});

it("updates existing presentations without using the open handler", async () => {
  await queries[ACCESS_UPDATE_QUERY]!(projection, { user: gm });
  expect(mocks.update).toHaveBeenCalledWith(projection);
  expect(mocks.present).not.toHaveBeenCalled();
});

it("passes the authenticated context sender to the authority and broadcasts only committed attempts", async () => {
  const action = { kind: "guess", id: "s", revision: 0, guess: [1] };
  const session = { id: "s" };
  mocks.submit.mockResolvedValueOnce({ status: "ok", projection }).mockResolvedValueOnce({ status: "stale", projection });
  mocks.session.mockReturnValue(session);
  await queries[ACCESS_ACTION_QUERY]!(action, { user: owner });
  expect(mocks.submit).toHaveBeenCalledWith(action, owner);
  expect(mocks.broadcast).toHaveBeenCalledWith(session);
  await queries[ACCESS_ACTION_QUERY]!(action, { user: owner });
  expect(mocks.broadcast).toHaveBeenCalledOnce();
});
