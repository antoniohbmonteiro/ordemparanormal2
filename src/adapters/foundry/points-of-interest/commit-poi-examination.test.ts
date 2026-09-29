import { afterEach, expect, it, vi } from "vitest";

const { passive, examine, acted } = vi.hoisted(() => ({ passive: vi.fn(), examine: vi.fn(), acted: vi.fn() }));
vi.mock("./investigate-poi", () => ({ resolveInvestigatePoi: passive }));
vi.mock("./examine-poi", () => ({ resolveExaminePoi: examine }));
vi.mock("./investigation-runtime", () => ({
  investigationParticipants: () => [{ uuid: "Actor.a" }],
  sceneInvestigationRuntime: () => ({ runId: "run" }),
  recordInvestigationAgentActed: acted,
}));
vi.mock("./poi-runtime-state", () => ({
  worldPoi: () => ({ uuid: "Item.poi" }), isGmControlledPoi: () => true,
  readScenePoiUuids: () => ["Item.poi"], readPoiVisibility: () => ({ mode: "everyone" }),
  isPoiVisibleTo: () => true,
}));
vi.mock("../../../application/checks/check-snapshot", () => ({ isSupportedCheckSnapshot: () => true }));
const { resolveCommitPoiExamination } = await import("./commit-poi-examination");
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup() {
  const requester = { id: "player", isGM: false };
  const gm = { id: "gm", isGM: true };
  const binding = { current: undefined as unknown };
  const message = { speaker: { actor: "a" }, author: { id: "player" },
    getFlag: (_scope: string, key: string) => key === "check"
      ? { schemaVersion: 4, check: { kind: "skill", key: "perception" } } : binding.current,
    update: vi.fn(async (data: Record<string, unknown>) => { binding.current = data["flags.ordemparanormal2.poiExaminationBinding"]; }),
  };
  const actor = { id: "a", uuid: "Actor.a", type: "agent", testUserPermission: () => true };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, get: (id: string) => id === "player" ? requester : gm },
    scenes: { get: () => ({}) }, actors: { get: () => actor }, messages: { get: () => message } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  passive.mockResolvedValue({ ok: true, newCount: 2 });
  examine.mockResolvedValue({ ok: true, newCount: 0, lostPd: 1 });
  acted.mockResolvedValue(true);
  const input = { sceneId: "scene", runId: "run", itemUuid: "Item.poi", actorUuid: "Actor.a",
    skill: "perception", messageId: "check" };
  return { input, requester, message, binding };
}

it("binds a confirmed Check before passive and Examinar effects, then marks acted", async () => {
  const f = setup();
  const result = await resolveCommitPoiExamination(f.input, f.requester as foundry.documents.User);
  expect(result).toEqual({ ok: true, passiveCount: 2, newCount: 0, lostPd: 1 });
  expect(f.message.update).toHaveBeenCalledOnce();
  expect(passive).toHaveBeenCalledBefore(examine);
  expect(examine).toHaveBeenCalledBefore(acted);
});

it("resumes the same bound Check after a partial failure and rejects another context", async () => {
  const f = setup();
  examine.mockRejectedValueOnce(new Error("interrupted"));
  await expect(resolveCommitPoiExamination(f.input, f.requester as foundry.documents.User)).rejects.toThrow("interrupted");
  expect(acted).not.toHaveBeenCalled();
  expect(await resolveCommitPoiExamination(f.input, f.requester as foundry.documents.User)).toMatchObject({ ok: true });
  expect(f.message.update).toHaveBeenCalledOnce();
  expect(await resolveCommitPoiExamination({ ...f.input, itemUuid: "Item.other" }, f.requester as foundry.documents.User))
    .toEqual({ ok: false, reason: "unavailable" });
});

it("rejects a Check for another Agent before binding or applying effects", async () => {
  const f = setup();
  f.message.speaker.actor = "other";
  expect(await resolveCommitPoiExamination(f.input, f.requester as foundry.documents.User))
    .toEqual({ ok: false, reason: "invalid" });
  expect(f.message.update).not.toHaveBeenCalled();
  expect(passive).not.toHaveBeenCalled();
  expect(examine).not.toHaveBeenCalled();
});
