import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const commonPath = process.env.FOUNDRY_V14_COMMON_PATH;
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!commonPath)("installed Foundry v14 Equipment model (no persistence)", () => {
  async function loadModel() {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    vi.stubGlobal("foundry", native);
    return (await import("./equipment-data-model")).EquipmentDataModel;
  }

  it("defaults legacy forms without inventing consumable resources", async () => {
    const Model = await loadModel();
    for (const uses of [null, { value: 3, max: 3 }, { value: 5, max: 5 }]) {
      const legacy = { category: "tool", description: "<p>Ferramenta</p>", uses };
      const model = new Model(structuredClone(legacy) as never, { strict: true } as never);
      expect(model.toObject()).toEqual({ ...legacy, quantity: null, useForms: [] });
    }
    expect(new Model({ category: "tool", description: "" } as never).toObject().uses).toBeNull();
    expect(new Model({ category: "tool", description: "", useForms: null } as never).toObject().useForms).toEqual([]);
  });

  it("round trips forms and accepts the sheet read/patch/update flow", async () => {
    const Model = await loadModel();
    const { patchEquipmentUse, readEquipmentUseForms } = await import("../../core/equipment/equipment-use");
    const source = { category: "tool", description: "<p>Ferramenta</p>", uses: { value: 3, max: 3 },
      useForms: [{ id: "illuminate", name: "Iluminar", description: "", consumesUse: false },
        { id: "burst", name: "Estouro", description: "<p>Luz UV</p>", consumesUse: true }] };
    const model = new Model(structuredClone(source) as never, { strict: true } as never);
    expect(JSON.parse(JSON.stringify(model.toObject()))).toEqual({ ...source, quantity: null,
      useForms: source.useForms.map(use => ({ ...use, mechanic: "standard" })) });
    const forms = readEquipmentUseForms(model.useForms)!;
    model.updateSource({ useForms: patchEquipmentUse(forms, "burst", { name: "Estouro UV" }) } as never);
    expect(model.toObject().useForms[1].name).toBe("Estouro UV");
    expect(forms[1].name).toBe("Estouro");
    expect(model.toObject().uses).toEqual(source.uses);
  });

  it("round trips nullable quantity, accepts zero and validates its safe integer bounds", async () => {
    const Model = await loadModel();
    const base = { category: "tool", description: "", uses: { value: 3, max: 3 }, useForms: [] };
    for (const quantity of [null, 0, 1, Number.MAX_SAFE_INTEGER]) {
      const model = new Model({ ...base, quantity } as never, { strict: true } as never);
      expect(JSON.parse(JSON.stringify(model.toObject()))).toEqual({ ...base, quantity });
      model.updateSource({ quantity: 2 } as never);
      expect(model.toObject()).toEqual({ ...base, quantity: 2 });
      model.updateSource({ quantity: null } as never);
      expect(model.toObject()).toEqual({ ...base, quantity: null });
    }
    for (const quantity of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => new Model({ ...base, quantity } as never, { strict: true } as never)).toThrow();
    }
    const model = new Model({ ...base, quantity: 2 } as never);
    expect(() => model.updateSource({ quantity: -1 } as never)).toThrow();
    expect(model.toObject()).toEqual({ ...base, quantity: 2 });
  });

  it("rejects invalid and duplicate forms on construction and update", async () => {
    const Model = await loadModel();
    const use = { id: "measure", name: "Medir", description: "", consumesUse: false };
    const base = { category: "tool", description: "", uses: null };
    for (const useForms of [[use, use], [{ ...use, name: " " }], [{ ...use, id: " " }]]) {
      expect(() => new Model({ ...base, useForms } as never, { strict: true } as never), JSON.stringify(useForms)).toThrow();
    }
    const model = new Model({ ...base, useForms: [use] } as never);
    expect(model.updateSource({ useForms: [{ ...use }, { ...use, name: "Outra forma" }] } as never)).toEqual({});
    expect(model.toObject().useForms).toEqual([{ ...use, mechanic: "standard" }]);
  });
  it("defaults a legacy form and validates mechanics on construction and updateSource", async () => {
    const Model = await loadModel();
    const use = { id: "analyze", name: "Analisar", description: "", consumesUse: false };
    const model = new Model({ useForms: [use] } as never, { strict: true } as never);
    expect(model.toObject().useForms[0].mechanic).toBe("standard");
    model.updateSource({ useForms: [{ ...use, mechanic: "laboratory" }] } as never);
    expect(model.toObject().useForms[0]).toEqual({ ...use, mechanic: "laboratory" });
    expect(() => new Model({ useForms: [{ ...use, mechanic: "unknown" }] } as never, { strict: true } as never)).toThrow();
    expect(model.updateSource({ useForms: [{ ...use, mechanic: "unknown" }] } as never)).toEqual({});
    expect(model.toObject().useForms[0].mechanic).toBe("laboratory");
    model.updateSource({ useForms: [{ ...use, mechanic: "radio" }] } as never);
    expect(model.toObject().useForms[0]).toEqual({ ...use, mechanic: "radio" });
    expect(model.toObject().uses).toBeNull();
  });
});
