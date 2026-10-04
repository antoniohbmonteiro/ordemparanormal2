import { afterEach, expect, it, vi } from "vitest";
import { publishLaboratoryResult } from "./publish-laboratory-result";
import type { LaboratorySnapshot } from "../../../application/equipment/laboratory-snapshot";
afterEach(() => vi.unstubAllGlobals());
it("publishes a single immutable private snapshot with serialized Rolls and no configured source or unknown clues", async () => {
  const users = [{ id: "gm", isGM: true }, { id: "owner", isGM: false }, { id: "stranger", isGM: false }];
  const messages: { getFlag(scope: string, key: string): unknown }[] = [];
  const create = vi.fn(async (source: { flags: Record<string, Record<string, unknown>> }) => {
    messages.push({ getFlag: (scope, key) => source.flags[scope][key] }); return {};
  });
  vi.stubGlobal("ChatMessage", { create, getSpeaker: () => ({ actor: "a" }) });
  vi.stubGlobal("game", { messages: { contents: messages }, users: { contents: users }, i18n: { localize: (key: string) => key } });
  const render = vi.fn(async () => "Historical card");
  vi.stubGlobal("foundry", { applications: { handlebars: { renderTemplate: render } } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  const actor = { testUserPermission: (user: { id: string }) => user.id === "owner" } as unknown as foundry.documents.Actor;
  const snapshot: LaboratorySnapshot = { schemaVersion: 1, equipmentName: "Fonte atual", formName: "Analisar", actorName: "Agente",
    mind: 6, ceiling: 8, dice: [4, 6, 8, 8], initial: [1, 2, 3, 4], results: [1, 2, 3, 4], remaining: 3,
    rerolls: [], outcome: "success", newCount: 2, rolls: [{ formula: "1d4", total: 1 }] as never };
  await publishLaboratoryResult(actor, "owner:operation", snapshot);
  await publishLaboratoryResult(actor, "owner:operation", snapshot);
  expect(create).toHaveBeenCalledOnce();
  const source = create.mock.calls[0][0] as unknown as { flags: { ordemparanormal2: { laboratory: LaboratorySnapshot } }; whisper: string[]; rolls: unknown[] };
  expect(source.whisper).toEqual(["gm", "owner"]);
  expect(source.rolls).toEqual(snapshot.rolls);
  expect(source.flags.ordemparanormal2.laboratory).toEqual(snapshot);
  (snapshot.results as number[])[0] = 4;
  expect(source.flags.ordemparanormal2.laboratory.results).toEqual([1, 2, 3, 4]);
  expect(JSON.stringify(source)).not.toMatch(/equipmentUuid|informationIds|mechanicConfig/);
});
