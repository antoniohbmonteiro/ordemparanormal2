import { describe, expect, it } from "vitest";

import { collectOwnedEquipment } from "./owned-equipment";

describe("owned Equipment", () => {
  it("sorts equipment and resolves category and uses", () => {
    const equipment = collectOwnedEquipment([
      {
        id: "later", type: "equipment", sort: 20, name: "B", img: null,
        system: { description: "Second", category: "tool", uses: null },
      },
      {
        id: "first", type: "equipment", sort: 10, name: "A", img: "a.webp",
        system: { description: "First", category: "weapon", uses: { value: 3, max: 4 } },
      },
      { id: "ability", type: "ability", sort: 0, name: "H", system: {} },
    ] as unknown as foundry.documents.Item[]);

    expect(equipment.map(({ id }) => id)).toEqual(["first", "later"]);
    expect(equipment[0]).toMatchObject({
      category: "weapon",
      uses: { value: 3, max: 4 },
    });
    expect(equipment[1]).toMatchObject({ category: "tool", uses: null });
  });

  it("falls back to the general category for malformed system data", () => {
    const equipment = collectOwnedEquipment([
      { id: "e1", type: "equipment", sort: 0, name: "E", system: { category: "unknown" } },
    ] as unknown as foundry.documents.Item[]);

    expect(equipment[0]?.category).toBe("general");
  });
});
