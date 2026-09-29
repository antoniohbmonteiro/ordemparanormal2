import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createCheck: vi.fn(), transfer: vi.fn(), candidates: vi.fn() }));
vi.mock("../../../features/checks/create-check-request", () => ({ createCheckRequest: mocks.createCheck }));
vi.mock("./investigation-share", () => ({ requestShareCandidates: mocks.candidates, transferShareClue: mocks.transfer }));
vi.mock("./investigation-runtime", () => ({
  sceneInvestigationRuntime: () => ({ runId: "run" }),
  investigationParticipants: () => [{ uuid: "Actor.sender" }, { uuid: "Actor.receiver" }],
  recordInvestigationActionSuccess: vi.fn(),
}));
vi.mock("../templates/ensure-shared-partials-loaded", () => ({ ensureSharedPartialsLoaded: vi.fn().mockResolvedValue(undefined) }));
const { resolveInvestigationRequest, renderInvestigationShareContent } = await import("./investigation-requests");
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("transfers a known clue before publishing one private receiver Check Request", async () => {
  const gm = { id: "gm", isGM: true, active: true };
  const player = { id: "player", isGM: false, active: true };
  const receiverOwner = { id: "receiverOwner", isGM: false, active: true };
  const outsider = { id: "outsider", isGM: false, active: true };
  const users = [gm, player, receiverOwner, outsider];
  const sender = { id: "sender", uuid: "Actor.sender", name: "Alan",
    testUserPermission: (user: typeof gm) => user.id === "player" };
  const receiver = { id: "receiver", uuid: "Actor.receiver", name: "Amanda",
    testUserPermission: (user: typeof gm) => user.id === "receiverOwner" };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, contents: users,
    get: (id: string) => users.find(user => user.id === id) },
  scenes: { get: () => ({ id: "scene" }) },
  actors: { get: (id: string) => id === "sender" ? sender : receiver } });
  const publicMessage = vi.fn();
  vi.stubGlobal("ChatMessage", { create: publicMessage });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  const clue = { kind: "poi" as const, itemUuid: "Item.poi", informationId: "known" };
  mocks.candidates.mockResolvedValue([{ reference: clue, label: "Pista", text: "A porta está aberta." }]);
  mocks.transfer.mockResolvedValue(true);
  mocks.createCheck.mockResolvedValue({ id: "one" });
  const result = await resolveInvestigationRequest({ kind: "share", sceneId: "scene", runId: "run",
    actorUuid: sender.uuid, receiverActorUuid: receiver.uuid, clue }, player as foundry.documents.User);
  expect(result).toEqual({ ok: true });
  expect(mocks.transfer).toHaveBeenCalledBefore(mocks.createCheck);
  expect(mocks.createCheck).toHaveBeenCalledOnce();
  expect(publicMessage).not.toHaveBeenCalled();
  const options = mocks.createCheck.mock.calls[0][1];
  expect(options.whisper).toEqual(["gm", "player", "receiverOwner"]);
  expect(options.speakerActor).toBe(sender);
  expect(options.systemFlags.investigationRequest).toMatchObject({
    kind: "share", clueText: "A porta está aberta.", actorUuid: sender.uuid, receiverActorUuid: receiver.uuid,
  });
});

it("keeps the clue and resolved Check outcome in the same share card context", async () => {
  const render = vi.fn().mockResolvedValue("card");
  vi.stubGlobal("foundry", { applications: { handlebars: { renderTemplate: render } } });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
  const state = { schemaVersion: 1 as const, kind: "share" as const, status: "approved" as const,
    sceneId: "scene", runId: "run", actorUuid: "Actor.sender", receiverActorUuid: "Actor.receiver",
    senderName: "Alan", receiverName: "Amanda", clueText: "A porta está aberta." };
  const lifecycle = { state: { status: "resolved" as const }, snapshot: { total: 13, outcome: "success" as const } };
  expect(await renderInvestigationShareContent(state, lifecycle as never)).toBe("card");
  expect(render.mock.calls[0][1]).toMatchObject({ clueText: state.clueText, senderName: "Alan",
    receiverName: "Amanda", total: 13, success: true, pending: false, resolved: true });
});
