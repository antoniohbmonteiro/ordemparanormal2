import { afterEach, expect, it, vi } from "vitest";

vi.mock("./investigation-runtime", () => ({ sceneInvestigationRuntime: () => ({ runId: "run" }),
  investigationParticipants: () => [{ uuid: "Actor.a" }] }));
vi.mock("./poi-runtime-queries", () => ({ serializePoiItemMutation: (_key: string, run: () => Promise<unknown>) => run() }));
const { createNarrativeClue } = await import("./investigation-clues");
afterEach(() => vi.unstubAllGlobals());

it("reuses the same narrative clue ID when a pending Share grant is resumed", async () => {
  const gm = { id: "gm", isGM: true };
  let state = { schemaVersion: 1, sceneId: "scene", clues: [] as unknown[] };
  const journal = { uuid: "JournalEntry.clues", getFlag: () => state,
    update: vi.fn(async (data: Record<string, unknown>) => {
      state = data["flags.ordemparanormal2.investigationClues"] as typeof state;
    }) };
  const scene = { id: "scene", name: "Porão", getFlag: () => journal.uuid };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm }, journal: { get: () => journal } });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } });
  const first = await createNarrativeClue(scene as never, "run", "Nova dedução", ["Actor.a"], "award-id");
  const retried = await createNarrativeClue(scene as never, "run", "Nova dedução", ["Actor.a"], "award-id");
  expect(first).toEqual(retried);
  expect(journal.update).toHaveBeenCalledOnce();
  expect(state.clues).toHaveLength(1);
});
