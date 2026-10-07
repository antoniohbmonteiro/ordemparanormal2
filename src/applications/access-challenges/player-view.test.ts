import { afterEach, beforeEach, expect, it, vi } from "vitest";
import translations from "../../../lang/pt-BR.json";
import type { PlayerProjection } from "../../application/access-challenges/session";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), source: vi.fn(), prepare: vi.fn(), dispatch: vi.fn() }));
vi.mock("../../adapters/foundry/actors/resolve-agent-check-participant", () => ({ resolveAgentCheckParticipant: mocks.resolve }));
vi.mock("../../adapters/foundry/abilities/read-agent-check-abilities", () => ({ readAgentCheckAbilities: mocks.source }));
vi.mock("../../features/checks/resolve-agent-check-interaction", () => ({ prepareAgentCheckInteraction: mocks.prepare }));
vi.mock("../../adapters/foundry/access-challenges/query-transport", () => ({ dispatchChallengeAction: mocks.dispatch }));
vi.mock("../../adapters/foundry/chat/publish-check-message", () => ({ getCurrentMessageMode: () => "publicroll" }));

const projection: PlayerProjection = { id: "s", gmUserId: "gm", participant: { kind: "token", uuid: "Scene.scene.Token.synthetic" },
  participantName: "Agente", participantImg: "agent.png", obstacle: "Porta", revision: 0, type: "break", difficulty: 7,
  pa: 10, remaining: 10, status: "active", latest: null };
const actor = new Proxy({}, { get(_target, property) {
  if (property === "system") throw new Error("The Player view must use the source adapter.");
  return undefined;
} });
let Module: typeof import("./player-view");

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  class Application {
    render = vi.fn(async () => this);
    close = vi.fn(async () => undefined);
  }
  vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base: unknown) => base } } });
  vi.stubGlobal("game", { i18n: { localize: (key: string) =>
    key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], translations) } });
  mocks.resolve.mockResolvedValue(actor);
  mocks.prepare.mockResolvedValue(null);
  Module = await import("./player-view");
});
afterEach(() => vi.unstubAllGlobals());

it("reads PV through the existing adapter and blocks Break at zero without opening the Check dialog", async () => {
  mocks.source.mockReturnValue({ health: 0 });
  const view = new Module.AccessChallengePlayerView(projection);
  await Module.AccessChallengePlayerView.DEFAULT_OPTIONS.actions.attemptBreak.call(view);
  expect(mocks.source).toHaveBeenCalledWith(actor);
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
  const context = await (view as unknown as { _prepareContext(): Promise<{ error: string }> })._prepareContext();
  expect(context.error).toBe("O agente não possui PV para tentar Arrombar.");
});

it("preserves the existing Check dialog options when PV is available", async () => {
  mocks.source.mockReturnValue({ health: 1 });
  const view = new Module.AccessChallengePlayerView(projection);
  await Module.AccessChallengePlayerView.DEFAULT_OPTIONS.actions.attemptBreak.call(view);
  expect(mocks.source).toHaveBeenCalledWith(actor);
  expect(mocks.prepare).toHaveBeenCalledWith(actor, { kind: "skill", key: "athletics" }, { lockedDifficulty: 7, reservedHealth: 1 });
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect(view.title).toBe("Desafio: Arrombar");
});
