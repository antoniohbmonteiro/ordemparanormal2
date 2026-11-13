import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const commonPath = process.env.FOUNDRY_V14_COMMON_PATH;
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!commonPath)("installed Foundry v14 Threat model", () => {
  async function loadModel() {
    if (!commonPath) throw new Error("Missing Foundry v14 common path.");
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath).href);
    vi.stubGlobal("foundry", native);
    return (await import("./threat-data-model")).ThreatDataModel;
  }

  it("defaults to an empty threat and round-trips null and zero RD", async () => {
    const Model = await loadModel();
    const model = new Model({}, { strict: true });
    expect(model.toObject()).toMatchObject({
      category: "", elements: [], attributes: { physical: 4, mind: 4, emotion: 4 },
      resources: { health: { value: 0, max: 0 } }, damageReduction: null,
      skills: [], actions: [], conditions: [], characteristics: { fearEnigma: "" },
    });
    model.updateSource({ damageReduction: 0 });
    expect(new Model(model.toObject(), { strict: true }).damageReduction).toBe(0);
    model.updateSource({ damageReduction: null });
    expect(model.toObject().damageReduction).toBeNull();
  });

  it("persists sparse skills, typed damage and canonical action references", async () => {
    const Model = await loadModel();
    const source = {
      skills: [{ kind: "skill", key: "fighting", die: 6 }, { kind: "aptitude", key: "tactics", die: 8 }],
      actions: [
        { id: "claws", name: "Garras", check: { kind: "skill", key: "fighting" }, damage: { expression: "RA+1", timing: "immediate" } },
        { id: "hold", name: "Afogar", check: { kind: "skill", key: "fighting" }, damage: { expression: "1d6 PV", timing: "perRound" } },
        { id: "other", name: "Outra ação" },
      ],
    } as const;
    const model = new Model(structuredClone({ skills: [...source.skills], actions: [...source.actions] }), { strict: true });
    expect(model.toObject()).toMatchObject(source);
    expect(model.actions[2]).toMatchObject({ check: null, damage: null });
    const previous = model.toObject();
    expect(() => model.updateSource({ skills: [] })).toThrow("Invalid threat action check");
    expect(model.toObject()).toEqual(previous);
    expect(() => new Model({ elements: ["Morte", "morte"] }, { strict: true })).toThrow();
    expect(() => new Model({
      actions: [{ id: "bad", name: "Ação", check: { kind: "skill", key: "fighting" } }],
    }, { strict: true })).toThrow();
  });
});
