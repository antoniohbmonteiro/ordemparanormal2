import { afterEach, expect, it, vi } from "vitest";

const { invalidate, createClue, grantClue, clues } = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined), createClue: vi.fn(), grantClue: vi.fn(), clues: vi.fn(),
}));
vi.mock("./poi-runtime-queries", () => ({ broadcastPoiInvalidation: invalidate }));
vi.mock("./investigation-clues", () => ({ createNarrativeClue: createClue,
  grantNarrativeClue: grantClue, narrativeCluesForScene: clues }));
const { recordInvestigationActionSuccess, grantPendingShareClue } = await import("./investigation-runtime");
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("locks Recapitular for the whole Scene run only after a successful result", async () => {
  const gm = { id: "gm", isGM: true };
  let runtime = { schemaVersion: 1, runId: "run", round: 1, actedAgentUuids: [] } as Record<string, unknown>;
  const scene = { id: "scene", tokens: [{ actorId: "a", actorLink: true }],
    getFlag: () => runtime,
    update: vi.fn(async (data: Record<string, unknown>) => { runtime = data["flags.ordemparanormal2.investigationRuntime"] as Record<string, unknown>; }) };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm },
    scenes: { get: () => scene }, actors: { get: () => ({ uuid: "Actor.a", type: "agent", name: "Alan" }) } });
  expect(await recordInvestigationActionSuccess("scene", "run", "Actor.a", "recap")).toBe(true);
  expect(runtime.recapSuccessActorUuid).toBe("Actor.a");
  expect(await recordInvestigationActionSuccess("scene", "run", "Actor.a", "recap")).toBe(false);
  expect(await recordInvestigationActionSuccess("scene", "old", "Actor.a", "recap")).toBe(false);
  expect(scene.update).toHaveBeenCalledOnce();
  expect(invalidate).toHaveBeenCalledOnce();
});

it("persists one Share clue pending with the global lock, then grants it once", async () => {
  const gm = { id: "gm", isGM: true };
  let runtime = { schemaVersion: 1, runId: "run", round: 1, actedAgentUuids: [] } as Record<string, unknown>;
  const scene = { id: "scene", tokens: [{ actorId: "a", actorLink: true }],
    getFlag: () => runtime,
    update: vi.fn(async (data: Record<string, unknown>) => { runtime = data["flags.ordemparanormal2.investigationRuntime"] as Record<string, unknown>; }) };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm }, scenes: { get: () => scene },
    actors: { get: () => ({ uuid: "Actor.a", type: "agent", name: "Alan" }) } });
  createClue.mockResolvedValue({ id: "clue" });
  expect(await recordInvestigationActionSuccess("scene", "run", "Actor.a", "share", "check-1")).toBe(true);
  expect(runtime).toMatchObject({ shareSuccessActorUuid: "Actor.a", shareSuccessMessageId: "check-1",
    shareCluePending: true });
  expect(await recordInvestigationActionSuccess("scene", "run", "Actor.a", "share", "check-1")).toBe(false);
  const results = await Promise.all([
    grantPendingShareClue("scene", "run", { kind: "new", text: "Nova dedução", recipientActorUuids: ["Actor.a"] }),
    grantPendingShareClue("scene", "run", { kind: "new", text: "Outra pista", recipientActorUuids: ["Actor.a"] }),
  ]);
  expect(results).toEqual([true, false]);
  expect(createClue).toHaveBeenCalledOnce();
  expect(createClue.mock.calls[0][1]).toBe("run");
  expect(createClue.mock.calls[0][2]).toBe("Nova dedução");
  expect(runtime).toMatchObject({ shareSuccessActorUuid: "Actor.a", shareCluePending: false,
    shareClueGrant: { kind: "new", text: "Nova dedução", recipientActorUuids: ["Actor.a"] } });
  expect(await grantPendingShareClue("scene", "run", { kind: "new", text: "Outra pista",
    recipientActorUuids: ["Actor.a"] })).toBe(false);
  expect(createClue).toHaveBeenCalledOnce();
});

it("resumes a claimed grant after a partial Scene write failure without changing the chosen clue", async () => {
  const gm = { id: "gm", isGM: true };
  let runtime = { schemaVersion: 1, runId: "run", round: 1, actedAgentUuids: [],
    shareSuccessActorUuid: "Actor.a", shareCluePending: true } as Record<string, unknown>;
  let failFinal = true;
  const scene = { id: "scene", tokens: [{ actorId: "a", actorLink: true }], getFlag: () => runtime,
    update: vi.fn(async (data: Record<string, unknown>) => {
      const next = data["flags.ordemparanormal2.investigationRuntime"] as Record<string, unknown>;
      if (next.shareCluePending === false && failFinal) { failFinal = false; throw new Error("write failed"); }
      runtime = next;
    }) };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm }, scenes: { get: () => scene },
    actors: { get: () => ({ uuid: "Actor.a", type: "agent", name: "Alan" }) } });
  createClue.mockResolvedValue({ id: "clue" });
  await expect(grantPendingShareClue("scene", "run", { kind: "new", text: "Pista escolhida",
    recipientActorUuids: ["Actor.a"] })).rejects.toThrow("write failed");
  const firstId = (runtime.shareClueGrant as { clueId: string }).clueId;
  expect(runtime.shareCluePending).toBe(true);
  expect(await grantPendingShareClue("scene", "run", { kind: "new", text: "Pista diferente",
    recipientActorUuids: ["Actor.a"] })).toBe(true);
  expect(createClue).toHaveBeenCalledTimes(2);
  expect(createClue.mock.calls.map(call => call[4])).toEqual([firstId, firstId]);
  expect(createClue.mock.calls.map(call => call[2])).toEqual(["Pista escolhida", "Pista escolhida"]);
  expect(runtime.shareCluePending).toBe(false);
});

it("can grant an existing narrative clue from this run without creating a new Journal entry", async () => {
  const gm = { id: "gm", isGM: true };
  let runtime = { schemaVersion: 1, runId: "run", round: 1, actedAgentUuids: [],
    shareSuccessActorUuid: "Actor.a", shareCluePending: true } as Record<string, unknown>;
  const scene = { id: "scene", tokens: [{ actorId: "a", actorLink: true }], getFlag: () => runtime,
    update: vi.fn(async (data: Record<string, unknown>) => {
      runtime = data["flags.ordemparanormal2.investigationRuntime"] as Record<string, unknown>;
    }) };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm }, scenes: { get: () => scene },
    actors: { get: () => ({ uuid: "Actor.a", type: "agent", name: "Alan" }) } });
  clues.mockReturnValue([{ id: "narrative", runId: "run", text: "Outra pista", knownAgentUuids: [] }]);
  grantClue.mockResolvedValue(true);
  expect(await grantPendingShareClue("scene", "run", { kind: "existing", clueId: "narrative",
    recipientActorUuids: ["Actor.a"] })).toBe(true);
  expect(grantClue).toHaveBeenCalledExactlyOnceWith(scene, "run", "narrative", ["Actor.a"]);
  expect(createClue).not.toHaveBeenCalled();
  expect(runtime.shareCluePending).toBe(false);
});
