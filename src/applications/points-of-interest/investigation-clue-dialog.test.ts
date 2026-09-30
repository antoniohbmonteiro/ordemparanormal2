import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runtime: vi.fn(), grant: vi.fn(), clues: vi.fn(),
  recipients: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../adapters/foundry/points-of-interest/investigation-runtime", () => ({
  sceneInvestigationRuntime: mocks.runtime, grantPendingShareClue: mocks.grant,
}));
vi.mock("../../adapters/foundry/points-of-interest/investigation-clues", () => ({
  narrativeCluesForScene: mocks.clues, createNarrativeClue: vi.fn(), grantNarrativeClue: vi.fn(),
}));
vi.mock("../../adapters/foundry/points-of-interest/refresh-investigation-share-card", () => ({
  refreshInvestigationShareCard: mocks.refresh,
}));
vi.mock("../../adapters/foundry/points-of-interest/poi-runtime-queries", () => ({ broadcastPoiInvalidation: vi.fn() }));
vi.mock("./poi-agent-reveal-dialog", () => ({ openPoiAgentRevealDialog: mocks.recipients }));
const { openPendingShareClueGrant } = await import("./investigation-clue-dialog");
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("collects the GM's clue choice once, grants through the shared operation, and refreshes the Share card", async () => {
  const gm = { id: "gm", isGM: true };
  const scene = { id: "scene" };
  const input = vi.fn().mockResolvedValue({ clueId: "", text: "Nova pista" });
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm }, scenes: { get: () => scene },
    i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { applications: { api: { DialogV2: { input } } } });
  mocks.runtime.mockReturnValue({ runId: "run", shareCluePending: true, shareSuccessMessageId: "check" });
  mocks.clues.mockReturnValue([]);
  mocks.recipients.mockResolvedValue(["Actor.a"]);
  mocks.grant.mockResolvedValue(true);
  expect(await openPendingShareClueGrant("scene", "run")).toBe(true);
  expect(mocks.grant).toHaveBeenCalledExactlyOnceWith("scene", "run", {
    kind: "new", text: "Nova pista", recipientActorUuids: ["Actor.a"],
  });
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith("check");
  mocks.runtime.mockReturnValue({ runId: "run", shareCluePending: true, shareSuccessMessageId: "check",
    shareClueGrant: { kind: "new", clueId: "award", text: "Nova pista", recipientActorUuids: ["Actor.a"] } });
  await openPendingShareClueGrant("scene", "run");
  expect(input).toHaveBeenCalledOnce();
  expect(mocks.grant).toHaveBeenLastCalledWith("scene", "run", undefined);
});

it("leaves the pending Share grant intact when the GM cancels selection", async () => {
  const gm = { id: "gm", isGM: true };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm }, scenes: { get: () => ({ id: "scene" }) },
    i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { applications: { api: { DialogV2: { input: vi.fn().mockResolvedValue(null) } } } });
  mocks.runtime.mockReturnValue({ runId: "run", shareCluePending: true });
  mocks.clues.mockReturnValue([]);
  expect(await openPendingShareClueGrant("scene", "run")).toBe(false);
  expect(mocks.grant).not.toHaveBeenCalled();
});
