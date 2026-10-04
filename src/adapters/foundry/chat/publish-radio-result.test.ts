import { afterEach, expect, it, vi } from "vitest";
import { publishRadioCheck, publishRadioResult } from "./publish-radio-result";
import type { RadioSnapshot } from "../../../application/equipment/radio-snapshot";
import type { ResolvedAgentCheckInteraction } from "../../../features/checks/resolve-agent-check-interaction";
vi.mock("../actors/read-agent-accent-color", () => ({ readAgentAccentColor: () => "#7F252B" }));
vi.mock("./render-check-card-content", () => ({ renderCheckCardContent: () => "normal Check card" }));
vi.mock("../../../application/checks/check-snapshot", () => ({ createCheckSnapshot: () => ({ schemaVersion: 4, total: 18 }) }));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const users = [{ id: "gm", isGM: true }, { id: "owner", isGM: false }, { id: "stranger", isGM: false }];
  const messages: { getFlag(scope: string, key: string): unknown }[] = [];
  const create = vi.fn(async (source: { flags: Record<string, Record<string, unknown>> }) => {
    messages.push({ getFlag: (scope, key) => source.flags[scope][key] }); return {};
  });
  vi.stubGlobal("ChatMessage", { create, getSpeaker: () => ({ actor: "a" }) });
  vi.stubGlobal("game", { user: users[0], messages: { contents: messages }, users: { contents: users }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { applications: { handlebars: { renderTemplate: vi.fn(async () => "Historical card") } } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  vi.stubGlobal("CONFIG", { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {}, "custom-mode": {} } } });
  const actor = { testUserPermission: (user: { id: string }) => user.id === "owner" } as unknown as foundry.documents.Actor;
  return { create, actor, requester: users[1] as foundry.documents.User };
}
it.each(["public", "gm", "blind", "self", "custom-mode"])("keeps normal Check mode %s and deduplicates publication", async mode => {
  const f = fixture();
  const toMessage = vi.fn(async (data: object, options: { messageMode: string }) => ({ ...data,
    whisper: options.messageMode === "public" ? [] : ["gm"], blind: options.messageMode === "blind" }));
  const resolved = { execution: { roll: { toMessage }, result: { total: 18 } }, appliedAbilityUses: [] } as unknown as ResolvedAgentCheckInteraction;
  await publishRadioCheck(f.actor, f.requester, "operation", resolved, mode);
  await publishRadioCheck(f.actor, f.requester, "operation", resolved, mode);
  expect(toMessage).toHaveBeenCalledOnce(); expect(toMessage.mock.calls[0][1]).toEqual({ messageMode: mode, create: false });
  expect(toMessage.mock.calls[0][0]).toMatchObject({ author: "owner", content: "normal Check card" });
  expect(f.create).toHaveBeenCalledOnce();
  expect(f.create.mock.calls[0][0]).toMatchObject({ whisper: mode === "self" ? ["owner"] : mode === "public" ? [] : ["gm"], blind: mode === "blind" });
});
it("keeps only the conclusion private and its immutable snapshot free of Check results and solution", async () => {
  const f = fixture();
  const snapshot: RadioSnapshot = { schemaVersion: 1, equipmentName: "Rádio", formName: "Forma", actorName: "Agente",
    initial: [{ id: "opaque", text: "Peça" }], active: [{ id: "opaque", text: "Peça" }], discarded: [], removedCount: 3,
    outcome: "failure", newCount: 0 };
  await publishRadioResult(f.actor, "operation", snapshot); await publishRadioResult(f.actor, "operation", snapshot);
  expect(f.create).toHaveBeenCalledOnce(); const source = f.create.mock.calls[0][0];
  expect(source).toMatchObject({ whisper: ["gm", "owner"], flags: { ordemparanormal2: { radio: snapshot } } });
  expect(JSON.stringify(source)).not.toMatch(/total|rolls|trueFragments|falseFragments|equipmentUuid|informationIds|mechanicConfig/);
  (snapshot.active as { id: string; text: string }[])[0]!.text = "Changed later";
  expect(source.flags.ordemparanormal2.radio).toMatchObject({ active: [{ text: "Peça" }] });
});
