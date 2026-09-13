import { describe, expect, it } from "vitest";

import { collectOwnedAbilities } from "./owned-abilities";

describe("owned Abilities", () => {
  it("sorts abilities and resolves resource costs", () => {
    const abilities = collectOwnedAbilities([
      {
        id: "later", type: "ability", sort: 20, name: "B", img: null,
        system: { description: "Second", uses: [], resource: null },
      },
      {
        id: "first", type: "ability", sort: 10, name: "A", img: "a.webp",
        system: { description: "First", uses: [{ id: "use", name: "Uso", description: "", cost: { source: "resource", amount: 2 }, minimumLevel: null }], resource: { value: 3, max: 4 } },
      },
      { id: "profile", type: "profile", sort: 0, name: "P", system: {} },
    ] as unknown as foundry.documents.Item[]);

    expect(abilities.map(({ id }) => id)).toEqual(["first", "later"]);
    expect(abilities[0]?.useSummary).toMatchObject({
      isSingleResource: true, amount: 2,
    });
    expect(abilities[0]?.resource).toEqual({ value: 3, max: 4 });
  });
});
