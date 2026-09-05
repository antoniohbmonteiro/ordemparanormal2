import { describe, expect, it } from "vitest";

import { collectOwnedAbilities } from "./owned-abilities";

describe("owned Abilities", () => {
  it("sorts abilities and resolves resource costs", () => {
    const abilities = collectOwnedAbilities([
      {
        id: "later", type: "ability", sort: 20, name: "B", img: null,
        system: { description: "Second", cost: { source: "none", amount: 0 }, resource: null },
      },
      {
        id: "first", type: "ability", sort: 10, name: "A", img: "a.webp",
        system: { description: "First", cost: { source: "resource", amount: 2 }, resource: { value: 3, max: 4 } },
      },
      { id: "profile", type: "profile", sort: 0, name: "P", system: {} },
    ] as unknown as foundry.documents.Item[]);

    expect(abilities.map(({ id }) => id)).toEqual(["first", "later"]);
    expect(abilities[0]?.cost).toMatchObject({
      kind: "resource", amount: 2,
    });
    expect(abilities[0]?.resource).toEqual({ value: 3, max: 4 });
  });
});
