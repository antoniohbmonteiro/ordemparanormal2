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
      expect(model.toObject()).toEqual({ ...legacy, useForms: [] });
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
    expect(JSON.parse(JSON.stringify(model.toObject()))).toEqual(source);
    const forms = readEquipmentUseForms(model.useForms)!;
    model.updateSource({ useForms: patchEquipmentUse(forms, "burst", { name: "Estouro UV" }) } as never);
    expect(model.toObject().useForms[1].name).toBe("Estouro UV");
    expect(forms[1].name).toBe("Estouro");
    expect(model.toObject().uses).toEqual(source.uses);
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
    expect(model.toObject().useForms).toEqual([use]);
  });
});
