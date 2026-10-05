import { describe, expect, it } from "vitest";
import { appendEquipmentUse, patchEquipmentUse, readEquipmentUse, readEquipmentUseForms,
  removeEquipmentUse, resolveEquipmentUse, type EquipmentUseData } from "./equipment-use";

const use: EquipmentUseData = { id: "measure", name: "Medir", description: "", consumesUse: false, mechanic: "standard" };
it("defaults only absent mechanics and rejects unrecognized mechanics", () => {
  const { mechanic: _mechanic, ...legacy } = use;
  expect(readEquipmentUse(legacy)?.mechanic).toBe("standard");
  expect(readEquipmentUse({ ...legacy, mechanic: "laboratory" })?.mechanic).toBe("laboratory");
  for (const mechanic of ["other", null, 1, false]) expect(readEquipmentUse({ ...legacy, mechanic })).toBeNull();
});

describe("Equipment use forms", () => {
  it("normalizes identity and name while preserving description and consumption", () => {
    expect(readEquipmentUse({ ...use, id: " measure ", name: " Medir ", description: " texto " }))
      .toEqual({ ...use, description: " texto " });
    expect(readEquipmentUse({ ...use, consumesUse: true })).toEqual({ ...use, consumesUse: true });
  });

  it.each([
    null, undefined, [], "measure", {}, { ...use, id: " " }, { ...use, name: " " },
    { ...use, id: 1 }, { ...use, name: 1 }, { ...use, description: null },
    { ...use, description: undefined }, { ...use, consumesUse: "false" },
    { ...use, consumesUse: undefined }, { ...use, consumesUse: 1 },
  ])("rejects an invalid form: %j", value => {
    expect(readEquipmentUse(value)).toBeNull();
  });

  it("requires an array of valid forms with unique normalized ids", () => {
    expect(readEquipmentUseForms([])).toEqual([]);
    expect(readEquipmentUseForms([use])).toEqual([use]);
    for (const invalid of [undefined, null, {}, [use, null], [use, use], [use, { ...use, id: " measure " }]]) {
      expect(readEquipmentUseForms(invalid)).toBeNull();
    }
    expect(readEquipmentUseForms([use, { ...use, id: "second" }])).toHaveLength(2);
  });

  it("resolves a form by id without relying on its display name", () => {
    expect(resolveEquipmentUse([use], "measure")).toBe(use);
    expect(resolveEquipmentUse([use], "Medir")).toBeNull();
  });

  it("appends, patches and removes without mutating inputs or changing other forms", () => {
    const first = Object.freeze({ ...use });
    const list = Object.freeze([first]);
    const second = Object.freeze({ ...use, id: "second", consumesUse: true });
    const added = appendEquipmentUse(list, second)!;
    expect(added).toEqual([use, second]);
    const patched = patchEquipmentUse(added, "measure", { name: " Medição ", description: "<p>Texto</p>" })!;
    expect(patched).toEqual([{ ...use, name: "Medição", description: "<p>Texto</p>" }, second]);
    expect(removeEquipmentUse(patched, "measure")).toEqual([second]);
    expect(list).toEqual([use]);
    expect(added).toEqual([use, second]);
    expect(patched).toHaveLength(2);
  });

  it("rejects duplicate additions, invalid patches and missing mutation targets", () => {
    expect(appendEquipmentUse([use], { ...use, id: " measure " })).toBeNull();
    expect(appendEquipmentUse([], { ...use, name: " " })).toBeNull();
    expect(patchEquipmentUse([use], "measure", { name: " " })).toBeNull();
    expect(patchEquipmentUse([use], "missing", { name: "Outra" })).toBeNull();
    expect(removeEquipmentUse([use], "missing")).toBeNull();
  });
});
