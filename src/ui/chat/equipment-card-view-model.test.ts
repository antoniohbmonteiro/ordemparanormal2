import { describe, expect, it } from "vitest";

import { buildEquipmentCardViewModel } from "./equipment-card-view-model";

describe("equipment card view model", () => {
  it("keeps the enriched description, category label and uses", () => {
    const model = buildEquipmentCardViewModel({
      name: "Pó Revelador",
      img: "icons/svg/aura.svg",
      category: "tool",
      description: "<p>Reage a vestígios paranormais.</p>",
      uses: { value: 5, max: 5 },
    });

    expect(model).toEqual({
      name: "Pó Revelador",
      img: "icons/svg/aura.svg",
      categoryLabelKey: "ORDEMPARANORMAL2.Equipment.Categories.tool",
      hasDescription: true,
      description: "<p>Reage a vestígios paranormais.</p>",
      hasUses: true,
      uses: { value: 5, max: 5 },
    });
  });

  it("flags an empty or whitespace-only description and absent uses", () => {
    const model = buildEquipmentCardViewModel({
      name: "Faca de Churrasco",
      img: "",
      category: "weapon",
      description: "   \n  ",
      uses: null,
    });

    expect(model.hasDescription).toBe(false);
    expect(model.description).toBe("");
    expect(model.img).toBe("icons/svg/item-bag.svg");
    expect(model.hasUses).toBe(false);
    expect(model.uses).toBeNull();
  });
});
