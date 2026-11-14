import { afterEach, expect, it, vi } from "vitest";
import { readWorldCustomSkillCatalog, registerCustomSkillCatalog, saveWorldCustomSkill } from "./custom-skill-catalog";
import type { CustomSkillDefinition } from "../../../core/actors/custom-skills";

afterEach(() => vi.unstubAllGlobals());

it("serializes GM catalog commands, rejects stale edits and permits retry of a committed command", async () => {
  const gm = { id: "gm", isGM: true, hasPermission: () => true };
  const player = { id: "player", isGM: false, hasPermission: () => true };
  let value: unknown;
  const settings = { get: () => value, set: vi.fn(async (_namespace, _key, next) => { value = next; }), register: vi.fn() };
  const queries: Record<string, (data: unknown, context: { user: typeof gm }) => Promise<unknown>> = {};
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm, get: (id: string) => id === gm.id ? gm : player }, settings });
  vi.stubGlobal("CONFIG", { queries });
  vi.stubGlobal("Hooks", { once: vi.fn() });
  registerCustomSkillCatalog();
  const definition: CustomSkillDefinition = {
    id: "custom_1234567890abcdef", name: "Amendoim", kind: "simple", archived: false, baseAttribute: "mind", revision: 1,
  };
  await expect(saveWorldCustomSkill(definition, 0)).resolves.toBe(definition.id);
  await expect(saveWorldCustomSkill(definition, 0)).resolves.toBe(definition.id);
  await expect(queries["ordemparanormal2.saveCustomSkill"]!({ definition, expectedRevision: 1 }, { user: player })).rejects.toThrow("forbidden");
  const results = await Promise.allSettled([
    saveWorldCustomSkill({ ...definition, name: "Amendoim torrado" }, 1),
    saveWorldCustomSkill({ ...definition, archived: true }, 1),
  ]);
  expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
  expect(readWorldCustomSkillCatalog()?.definitions).toMatchObject([{ name: "Amendoim torrado", revision: 2, archived: false }]);
  expect(settings.set).toHaveBeenCalledTimes(2);
  value = "{";
  await expect(saveWorldCustomSkill(definition, 1)).rejects.toThrow();
  expect(settings.set).toHaveBeenCalledTimes(2);
});
