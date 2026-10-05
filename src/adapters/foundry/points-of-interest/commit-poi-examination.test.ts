import { afterEach, expect, it, vi } from "vitest";

const { passive, examine, acted, examinationIds } = vi.hoisted(() => ({ passive: vi.fn(), examine: vi.fn(), acted: vi.fn(), examinationIds: vi.fn() }));
vi.mock("./investigate-poi", () => ({ resolveInvestigatePoi: passive }));
vi.mock("./examine-poi", () => ({ resolveExaminePoi: examine }));
vi.mock("./investigation-runtime", () => ({
  investigationParticipants: () => [{ uuid: "Actor.a" }],
  sceneInvestigationRuntime: () => ({ runId: "run" }),
  recordInvestigationAgentActed: acted,
}));
vi.mock("./poi-runtime-state", () => ({
  worldPoi: () => item, isGmControlledPoi: () => true,
  readScenePoiUuids: () => ["Item.poi"], readPoiVisibility: () => ({ mode: "everyone" }),
  isPoiVisibleTo: () => true, readPoiKnowledge: () => [],
}));
vi.mock("../../../application/checks/check-snapshot", () => ({ isSupportedCheckSnapshot: () => true }));
vi.mock("../../../core/investigation/resolve-information", () => ({ reachableInformationIds: () => ["one", "two"] }));
vi.mock("../../../features/points-of-interest/resolve-examination", () => ({ resolveExamination: () => ({ newInformationIds: examinationIds() }) }));
vi.mock("../actors/read-agent-check-source", () => ({ readAgentCheckSource: () => ({ skills: { perception: 8 } }) }));
vi.mock("../templates/ensure-shared-partials-loaded", () => ({ ensureSharedPartialsLoaded: async () => undefined }));
let storedPlans: unknown;
const item = { uuid: "Item.poi", name: "POI", system: { information: ["one", "two", "three"].map(id => ({
  id, content: `Texto ${id}`, availability: { mode: "always", condition: "" },
  approaches: [{ skill: "perception", difficulty: 8, showDifficultyToPlayers: false }],
})) },
  getFlag: (_scope: string, key: string) => key === "poiExaminationResults" ? storedPlans : undefined,
  update: vi.fn(async (data: Record<string, unknown>) => { storedPlans = data["flags.ordemparanormal2.poiExaminationResults"]; }) };
const { resolveCommitPoiExamination } = await import("./commit-poi-examination");
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); storedPlans = undefined; });

function setup() {
  const requester = { id: "player", isGM: false };
  const gm = { id: "gm", isGM: true };
  const binding = { current: undefined as unknown };
  const message = { speaker: { actor: "a" }, author: { id: "player" },
    getFlag: (_scope: string, key: string) => key === "check"
      ? { schemaVersion: 4, check: { kind: "skill", key: "perception" }, total: 8 } : binding.current,
    update: vi.fn(async (data: Record<string, unknown>) => { binding.current = data["flags.ordemparanormal2.poiExaminationBinding"]; }),
  };
  const actor = { id: "a", uuid: "Actor.a", name: "Agent", type: "agent",
    system: { resources: { determination: { value: 2 } } }, testUserPermission: () => true };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, contents: [requester, gm], get: (id: string) => id === "player" ? requester : gm },
    scenes: { get: () => ({}) }, actors: { get: () => actor }, messages: { get: () => message, contents: [] } });
  vi.stubGlobal("foundry", { applications: { handlebars: { renderTemplate: vi.fn().mockResolvedValue("card") } },
    data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  vi.stubGlobal("ChatMessage", { create: vi.fn().mockResolvedValue({}), getSpeaker: () => ({ actor: "a" }) });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  passive.mockResolvedValue({ ok: true, newCount: 2 });
  examine.mockResolvedValue({ ok: true, newCount: 0, lostPd: 1 });
  examinationIds.mockReturnValue([]);
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
  const card = vi.mocked(foundry.applications.handlebars.renderTemplate).mock.calls[0];
  expect(card[1]).toMatchObject({ passiveCount: 2, examinedCount: 0, lostPd: 1,
    noExaminationFindings: true });
  expect(JSON.stringify(card[1])).not.toContain("difficulty");
  expect(vi.mocked(ChatMessage.create)).toHaveBeenCalledWith(expect.objectContaining({
    whisper: ["player", "gm"], flags: { ordemparanormal2: { poiExaminationResult: "check" } },
  }));
});

it("publishes every examination finding without including hidden DT", async () => {
  const f = setup();
  examinationIds.mockReturnValue(["three"]);
  const result = await resolveCommitPoiExamination(f.input, f.requester as foundry.documents.User);
  expect(result).toMatchObject({ ok: true, passiveCount: 2, newCount: 1, lostPd: 0 });
  const card = vi.mocked(foundry.applications.handlebars.renderTemplate).mock.calls[0][1];
  expect(card).toMatchObject({ passive: ["Texto one", "Texto two"], examined: ["Texto three"],
    noExaminationFindings: false, lostPd: 0 });
  expect(JSON.stringify(card)).not.toContain("difficulty");
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
