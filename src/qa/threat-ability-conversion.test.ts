import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../config/system-config";
import { convertThreatAbilities, previewThreatAbilityConversion } from "./threat-ability-conversion";

const action = (id: string) => ({
  id, name: id, typeLabel: "Ataque", requirements: "", description: "<texto>",
  check: null, damage: { expression: "1d6 PV", timing: "perRound" },
});

function fixture() {
  let nextId = 0;
  type CopySource = { name: string; type: string; flags: Record<string, Record<string, unknown>> };
  type Copy = CopySource & { id: string; getFlag: (scope: string, key: string) => unknown };
  const base = makeActor("Actor.base");
  const synthetic = makeActor("Scene.test.Token.local.Actor.base", base);
  const excluded = makeActor("Scene.test.Token.excluded.Actor.base", base);
  const inherited = makeActor("Scene.test.Token.inherited.Actor.base", base);
  base.system.actions.push(action("a"), action("b"));
  synthetic.system.actions.push(action("b"), action("c"));
  const local = makeToken("local", synthetic, { actions: synthetic.system.actions, resources: { health: { value: 2 } } });
  const empty = makeToken("excluded", excluded, { actions: [] });
  const noOverride = makeToken("inherited", inherited, { resources: { health: { value: 1 } } });
  vi.stubGlobal("game", { user: { isGM: true }, actors: [base], scenes: [{ tokens: [local, empty, noOverride] }] });
  return { base, synthetic, excluded, inherited, local, empty, noOverride };

  function makeActor(uuid: string, parent?: { readonly items: readonly Copy[] }) {
    const copies: Copy[] = [];
    const excluded = new Set<string>();
    const system = { actions: [] as ReturnType<typeof action>[], characteristics: { passiveEffects: [], specialAbilities: [] } };
    return {
      uuid, id: "base", type: "threat", system, copies,
      get items(): typeof copies { return [...(parent?.items.filter(({ id }) => !excluded.has(id)) ?? []), ...copies]; },
      createEmbeddedDocuments: vi.fn(async (_type: string, sources: CopySource[]) => {
        for (const source of sources) {
          copies.push({ ...source, id: String(nextId++), getFlag: (scope, key) => source.flags[scope]?.[key] });
        }
      }),
      deleteEmbeddedDocuments: vi.fn(async (_type: string, ids: string[]) => ids.forEach((id) => excluded.add(id))),
      update: vi.fn(async () => { system.actions = []; }),
    };
  }

  function makeToken(id: string, actor: typeof synthetic, system: { actions?: unknown[]; resources?: unknown }) {
    const delta = {
      toObject: () => ({ system: structuredClone(system) }),
    };
    const update = vi.fn(async (patch: { delta: { system: typeof system } }) => {
      if (!Object.hasOwn(patch.delta.system, "actions")) delete system.actions;
    });
    return { uuid: `Scene.test.Token.${id}`, actor, actorId: "base", baseActor: base, delta, system, update };
  }
}

beforeEach(() => {
  vi.stubGlobal("CONST", { SORT_INTEGER_DENSITY: 100_000 });
  vi.stubGlobal("foundry", {
    utils: {
      getProperty: (data: Record<string, unknown>, key: string) => data[key],
      escapeHTML: (text: string) => text.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    },
    documents: { Item: { implementation: class { validate() { return true; } } } },
    data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Development threat conversion", () => {
  it("preserves inherited, ordered local and explicitly empty lists, and clears only converted arrays", async () => {
    const { base, synthetic, excluded, inherited, local, noOverride } = fixture();
    const preview = previewThreatAbilityConversion();
    expect(preview.map(({ uuid }) => uuid)).toEqual([base.uuid, local.uuid, "Scene.test.Token.excluded"]);
    await expect(convertThreatAbilities(preview)).resolves.toEqual({ completed: [base.uuid], failed: [] });
    expect(base.items.map(({ name }) => name)).toEqual(["a", "b"]);
    expect(inherited.items.map(({ name }) => name)).toEqual(["a", "b"]);
    expect(synthetic.items.map(({ name }) => name)).toEqual(["b", "c"]);
    expect(excluded.items).toEqual([]);
    expect(local.system).toEqual({ resources: { health: { value: 2 } } });
    expect(noOverride.update).not.toHaveBeenCalled();
    expect(base.createEmbeddedDocuments).toHaveBeenCalledWith("Item", expect.arrayContaining([
      expect.objectContaining({ system: expect.objectContaining({ uses: [expect.objectContaining({
        description: "<p>&lt;texto&gt;</p>",
        combatAction: expect.objectContaining({ damage: { expression: "1d6 PV", timing: "perRound" } }),
      })] }) }),
    ]));
    expect(base.items[0]?.flags[SYSTEM_ID]).not.toHaveProperty("sourceUuid");
    await expect(convertThreatAbilities(previewThreatAbilityConversion())).resolves.toEqual({ completed: [], failed: [] });
  });

  it("retains the source on partial failure and resumes without overwriting an edited copy", async () => {
    const { base, synthetic, local } = fixture();
    synthetic.deleteEmbeddedDocuments.mockRejectedValueOnce(new Error("Database error"));
    await expect(convertThreatAbilities(previewThreatAbilityConversion())).resolves.toEqual({
      completed: [], failed: [{ uuid: local.uuid, reason: "Database error" }],
    });
    expect(base.system.actions).toHaveLength(2);
    expect(local.system.actions).toHaveLength(2);
    synthetic.copies[0]!.name = "Edited";
    await expect(convertThreatAbilities(previewThreatAbilityConversion())).resolves.toEqual({ completed: [base.uuid], failed: [] });
    expect(synthetic.items.map(({ name }) => name)).toEqual(["Edited", "c"]);
    expect(synthetic.createEmbeddedDocuments).toHaveBeenCalledOnce();
  });
});
