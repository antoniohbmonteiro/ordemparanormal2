import { afterEach, expect, it, vi } from "vitest";
import { updateActorCustomSkill } from "./actor-custom-skills";

afterEach(() => vi.unstubAllGlobals());

it("writes suppression, deletion and re-addition to the selected token actor only", async () => {
  const inherited = "custom_1234567890abcdef";
  const own = "custom_9876543210abcdef";
  class ForcedDeletion {}
  const base = { system: { customSkills: { [inherited]: 6 } }, update: vi.fn() };
  const sibling = { system: { customSkills: { [inherited]: 6 } }, update: vi.fn() };
  const overrides = new Map<string, number | null>([[inherited, 8], [own, 10]]);
  const synthetic = {
    uuid: "Scene.test.Token.first.Actor.base",
    type: "threat",
    token: { uuid: "Scene.test.Token.first", isLinked: false, baseActor: base,
      get actor() { return synthetic; } },
    get system() { return { customSkills: { ...base.system.customSkills, ...Object.fromEntries(overrides) } }; },
    canUserModify: vi.fn(() => true),
    update: vi.fn(async (patch: Record<string, unknown>) => {
      for (const [path, value] of Object.entries(patch)) {
        const key = path.slice("system.customSkills.".length);
        if (value instanceof ForcedDeletion) overrides.delete(key);
        else if (value === null || typeof value === "number") overrides.set(key, value);
      }
      return true;
    }),
  };
  vi.stubGlobal("foundry", { data: { operators: { ForcedDeletion } } });
  vi.stubGlobal("game", { user: {}, settings: { get: () => JSON.stringify({
    version: 1, definitions: [{ id: inherited, kind: "simple", name: "Amendoim", baseAttribute: "mind", archived: false, revision: 1 }],
  }) } });
  const actor = synthetic as unknown as foundry.documents.Actor;
  await updateActorCustomSkill(actor, inherited, null, "remove", () => true);
  await updateActorCustomSkill(actor, own, null, "remove", () => true);
  expect(overrides.get(inherited)).toBeNull();
  expect(overrides.has(own)).toBe(false);
  expect(synthetic.update.mock.calls[1]?.[0]).toEqual({ [`system.customSkills.${own}`]: expect.any(ForcedDeletion) });

  await updateActorCustomSkill(actor, inherited, 6, "add", () => true);
  expect(overrides.get(inherited)).toBe(6);
  expect(base.update).not.toHaveBeenCalled();
  expect(sibling.update).not.toHaveBeenCalled();
  expect(base.system.customSkills[inherited]).toBe(6);
  await expect(updateActorCustomSkill(actor, inherited, 8, "edit", () => false)).rejects.toThrow("permissão");
  expect(synthetic.update).toHaveBeenCalledTimes(3);
});
