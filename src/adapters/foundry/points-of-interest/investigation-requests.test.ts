import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const mocks = vi.hoisted(() => ({ createCheck: vi.fn(), transfer: vi.fn(), candidates: vi.fn(),
  record: vi.fn(), lifecycle: vi.fn(), runtime: vi.fn().mockReturnValue({ runId: "run" }),
  refreshCard: vi.fn().mockResolvedValue(undefined), openClueDialog: vi.fn() }));
vi.mock("../../../features/checks/create-check-request", () => ({ createCheckRequest: mocks.createCheck }));
vi.mock("./investigation-share", () => ({ requestShareCandidates: mocks.candidates, transferShareClue: mocks.transfer }));
vi.mock("./investigation-runtime", () => ({
  sceneInvestigationRuntime: mocks.runtime,
  investigationParticipants: () => [{ uuid: "Actor.sender" }, { uuid: "Actor.receiver" }],
  recordInvestigationActionSuccess: mocks.record,
}));
vi.mock("../templates/ensure-shared-partials-loaded", () => ({ ensureSharedPartialsLoaded: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../chat/read-check-request-message", () => ({ readCheckRequestMessageLifecycle: mocks.lifecycle }));
vi.mock("./refresh-investigation-share-card", () => ({ refreshInvestigationShareCard: mocks.refreshCard }));
vi.mock("../../../applications/points-of-interest/investigation-clue-dialog", () => ({
  openCreateInvestigationClueDialog: mocks.openClueDialog,
}));
const { resolveInvestigationRequest, renderInvestigationShareContent, decideInvestigationRequest,
  onInvestigationCheckMessageUpdated } = await import("./investigation-requests");
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

it("shows Share grant only to the active GM while the successful run has a pending clue", async () => {
  const gm = { id: "gm", isGM: true };
  const player = { id: "player", isGM: false };
  const render = vi.fn().mockResolvedValue("card");
  vi.stubGlobal("foundry", { applications: { handlebars: { renderTemplate: render } } });
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm },
    scenes: { get: () => ({ id: "scene" }) }, i18n: { localize: (key: string) => key } });
  const state = { schemaVersion: 1 as const, kind: "share" as const, status: "approved" as const,
    sceneId: "scene", runId: "run", actorUuid: "Actor.sender", receiverActorUuid: "Actor.receiver",
    senderName: "Alan", receiverName: "Edgar", clueText: "Pista A" };
  const success = { state: { status: "resolved" }, snapshot: { total: 17, outcome: "success" } } as never;
  mocks.runtime.mockReturnValue({ runId: "run", shareSuccessMessageId: "check", shareCluePending: true });
  await renderInvestigationShareContent(state, success, "check");
  expect(render.mock.lastCall?.[1]).toMatchObject({ grantPending: true, canGrant: true, grantResolved: false });
  (game as typeof game & { user: typeof player }).user = player as never;
  await renderInvestigationShareContent(state, success, "check");
  expect(render.mock.lastCall?.[1]).toMatchObject({ grantPending: true, canGrant: false });
  (game as typeof game & { user: typeof gm }).user = gm as never;
  mocks.runtime.mockReturnValue({ runId: "run", shareSuccessMessageId: "check", shareCluePending: false });
  await renderInvestigationShareContent(state, success, "check");
  expect(render.mock.lastCall?.[1]).toMatchObject({ grantPending: false, canGrant: false, grantResolved: true });
  mocks.runtime.mockReturnValue({ runId: "run", shareSuccessMessageId: "check", shareCluePending: true });
  await renderInvestigationShareContent(state, { state: {}, snapshot: { total: 5, outcome: "failure" } } as never, "check");
  expect(render.mock.lastCall?.[1]).toMatchObject({ grantPending: false, canGrant: false });
  const template = await readFile(fileURLToPath(new URL(
    "../../../../templates/chat/investigation-share-card.hbs", import.meta.url)), "utf8");
  expect(template).toContain("{{#if canGrant}}");
  expect(template).toContain("data-investigation-share-grant");
});

it("locks a successful Share and refreshes its card without opening a clue dialog", async () => {
  const gm = { id: "gm", isGM: true };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm } });
  const direct = { schemaVersion: 1, kind: "share", status: "approved", sceneId: "scene", runId: "run",
    actorUuid: "Actor.sender", receiverActorUuid: "Actor.receiver", clueText: "Pista A" };
  const message = { id: "check", getFlag: (_scope: string, key: string) => key === "investigationRequest" ? direct : undefined };
  mocks.lifecycle.mockReturnValue({ state: { participant: { kind: "actor", uuid: "Actor.receiver" },
    selection: { key: "research" } }, snapshot: { difficulty: 10, outcome: "failure" } });
  await onInvestigationCheckMessageUpdated(message as never);
  expect(mocks.record).not.toHaveBeenCalled();
  mocks.lifecycle.mockReturnValue({ state: { participant: { kind: "actor", uuid: "Actor.receiver" },
    selection: { key: "research" } }, snapshot: { difficulty: 10, outcome: "success" } });
  mocks.record.mockResolvedValueOnce(true).mockResolvedValue(false);
  await onInvestigationCheckMessageUpdated(message as never);
  await onInvestigationCheckMessageUpdated(message as never);
  expect(mocks.record).toHaveBeenCalledTimes(2);
  expect(mocks.record).toHaveBeenCalledWith("scene", "run", "Actor.sender", "share", "check");
  expect(mocks.refreshCard).toHaveBeenCalledOnce();
  expect(mocks.openClueDialog).not.toHaveBeenCalled();
});

it("handles Recapitular without typed text or Agent selection, locking only after a successful Check", async () => {
  const gm = { id: "gm", isGM: true, active: true };
  const player = { id: "player", isGM: false, active: true };
  const users = [gm, player];
  const actor = { id: "sender", uuid: "Actor.sender", name: "Alan", img: "",
    testUserPermission: (user: typeof gm) => user.id === "player" };
  const messages = new Map<string, { id: string; state: Record<string, unknown>;
    getFlag: (_scope: string, key: string) => unknown; update: ReturnType<typeof vi.fn> }>();
  let nextId = 0;
  const createMessage = vi.fn(async (data: Record<string, unknown>) => {
    const id = `request-${++nextId}`;
    const message = { id, state: (data.flags as Record<string, Record<string, unknown>>).ordemparanormal2,
      getFlag(_scope: string, key: string) { return this.state[key]; },
      update: vi.fn(async (update: Record<string, unknown>) => {
        message.state.investigationRequest = update["flags.ordemparanormal2.investigationRequest"];
      }) };
    messages.set(id, message);
    return message;
  });
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, contents: users,
    get: (id: string) => users.find(user => user.id === id) },
  scenes: { get: () => ({ id: "scene" }) }, actors: { get: () => actor },
  messages: { get: (id: string) => messages.get(id) }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  vi.stubGlobal("ChatMessage", { create: createMessage, getSpeaker: () => ({}) });
  vi.stubGlobal("foundry", { applications: { handlebars: { renderTemplate: async () => "card" } } });
  vi.stubGlobal("ui", { notifications: { info: vi.fn() } });
  mocks.createCheck.mockImplementation(async () => ({ id: `check-${mocks.createCheck.mock.calls.length}`,
    update: vi.fn() }));
  const input = { kind: "recap" as const, sceneId: "scene", runId: "run", actorUuid: "Actor.sender" };
  expect(await resolveInvestigationRequest(input, player as foundry.documents.User)).toEqual({ ok: true });
  expect(createMessage.mock.calls[0][0].flags).toMatchObject({ ordemparanormal2: {
    investigationRequest: { kind: "recap", actorUuid: "Actor.sender" },
  } });
  expect(JSON.stringify(createMessage.mock.calls[0][0])).not.toContain('"text"');
  expect(await decideInvestigationRequest("request-1", true, player as foundry.documents.User)).toBe(false);
  expect(await decideInvestigationRequest("request-1", false, gm as foundry.documents.User)).toBe(true);
  expect(mocks.createCheck).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
  expect(await resolveInvestigationRequest(input, player as foundry.documents.User)).toEqual({ ok: true });
  expect(await decideInvestigationRequest("request-2", true, gm as foundry.documents.User)).toBe(true);
  expect(mocks.createCheck).toHaveBeenCalledExactlyOnceWith({
    participant: { kind: "actor", uuid: "Actor.sender" },
    selection: { kind: "skill", key: "intuition" }, difficulty: 10,
  });
  const request = messages.get("request-2")!;
  expect(request.state.investigationRequest).toMatchObject({ status: "approved", checkMessageId: "check-1" });
  const check = { id: "check-1", getFlag: (_scope: string, key: string) => key === "investigationCheck" ? {
    schemaVersion: 1, kind: "recap", sceneId: "scene", runId: "run", actorUuid: "Actor.sender",
    checkActorUuid: "Actor.sender", requestMessageId: "request-2",
  } : undefined };
  mocks.lifecycle.mockReturnValue(null);
  await onInvestigationCheckMessageUpdated(check as never);
  mocks.lifecycle.mockReturnValue({ state: { participant: { kind: "actor", uuid: "Actor.sender" },
    selection: { key: "intuition" } }, snapshot: { difficulty: 10, outcome: "failure" } });
  await onInvestigationCheckMessageUpdated(check as never);
  expect(mocks.record).not.toHaveBeenCalled();
  mocks.lifecycle.mockReturnValue({ state: { participant: { kind: "actor", uuid: "Actor.sender" },
    selection: { key: "intuition" } }, snapshot: { difficulty: 10, outcome: "success" } });
  mocks.record.mockResolvedValue(false);
  await onInvestigationCheckMessageUpdated(check as never);
  expect(mocks.record).toHaveBeenCalledExactlyOnceWith("scene", "run", "Actor.sender", "recap");
});
