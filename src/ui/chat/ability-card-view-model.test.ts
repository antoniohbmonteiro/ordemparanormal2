import { describe, expect, it } from "vitest";

import { buildAbilityCardViewModel } from "./ability-card-view-model";

describe("ability card view model", () => {
  it("keeps the enriched description and marks it present", () => {
    const model = buildAbilityCardViewModel({
      name: "Primeiro Socorro",
      img: "icons/svg/aura.svg",
      description: "<p>Recupera <strong>PV</strong>.</p>",
    });

    expect(model).toEqual({
      name: "Primeiro Socorro",
      img: "icons/svg/aura.svg",
      hasDescription: true,
      description: "<p>Recupera <strong>PV</strong>.</p>",
    });
  });

  it("flags an empty or whitespace-only description", () => {
    const model = buildAbilityCardViewModel({
      name: "Golpe",
      img: "",
      description: "   \n  ",
    });

    expect(model.hasDescription).toBe(false);
    expect(model.description).toBe("");
    expect(model.img).toBe("icons/svg/item-bag.svg");
  });
});
