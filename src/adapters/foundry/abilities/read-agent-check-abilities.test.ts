import { describe, expect, it } from "vitest";
import { readAgentCheckAbilities } from "./read-agent-check-abilities";

describe("read Agent check Abilities", () => {
  it("projects current balances and sorted embedded Abilities into plain data", () => {
    const actor = {
      type: "agent",
      system: { level: 4, resources: { health: { value: 7 }, determination: { value: 5 } } },
      items: [
        { id: "later", type: "ability", sort: 20, name: "B", system: { uses: [], resource: null } },
        { id: "first", type: "ability", sort: 10, name: "A", system: { uses: [{ id: "u", name: "Uso", description: "", cost: { source: "none", amount: 0 }, minimumLevel: null }], resource: { value: 2, max: 3 } } },
        { id: "profile", type: "profile", sort: 0, name: "P", system: {} },
      ],
    } as unknown as foundry.documents.Actor;
    expect(readAgentCheckAbilities(actor)).toEqual({
      level: 4, health: 7, determination: 5,
      abilities: [
        { id: "first", name: "A", resource: { value: 2, max: 3 }, uses: [{ id: "u", name: "Uso", description: "", cost: { source: "none", amount: 0 }, minimumLevel: null, checkIntegration: null }] },
        { id: "later", name: "B", resource: null, uses: [] },
      ],
    });
  });
});
