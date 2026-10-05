import { afterEach, expect, it, vi } from "vitest";
import { executeLaboratoryRoll } from "./execute-laboratory-roll";
afterEach(() => vi.unstubAllGlobals());
it("rolls one public, non-interactive Roll per position and serializes its historical result", async () => {
  const evaluate = vi.fn(async () => undefined);
  const serialized = { formula: "1d12", total: 7 };
  const roll = { dice: [{ faces: 12, results: [{ result: 7, active: true }] }], evaluate, toJSON: () => serialized };
  const create = vi.fn(() => roll);
  vi.stubGlobal("Roll", { create });
  expect(await executeLaboratoryRoll(12)).toEqual({ value: 7, serialized });
  expect(create).toHaveBeenCalledExactlyOnceWith("1d12");
  expect(evaluate).toHaveBeenCalledExactlyOnceWith({ allowInteractive: false });
});
it.each([[], [{ result: 1, discarded: true }], [{ result: 1 }, { result: 2 }], [{ result: 5 }]].map(results => ({ results })))(
  "rejects malformed or out-of-bounds native results $results", async ({ results }) => {
    vi.stubGlobal("Roll", { create: () => ({ dice: [{ faces: 4, results }], evaluate: vi.fn(async () => undefined), toJSON: vi.fn() }) });
    await expect(executeLaboratoryRoll(4)).rejects.toThrow();
  });
