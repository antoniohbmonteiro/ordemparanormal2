import { describe, expect, it } from "vitest";

import {
  appendAbilityUse,
  createAbilityUsePatch,
  isAbilityUseAvailable,
  patchAbilityUse,
  readAbilityUses,
  removeAbilityUse,
  reorderAbilityUse,
  type AbilityUseData,
} from "./ability-use";

const first: AbilityUseData = {
  id: "first",
  name: "Primeira",
  description: "<p>Texto</p>",
  cost: { source: "none", amount: 0 },
  minimumLevel: null,
};
const second: AbilityUseData = {
  id: "second",
  name: "Segunda",
  description: "",
  cost: { source: "determination", amount: 2 },
  minimumLevel: 2,
};

describe("Ability uses", () => {
  it("reads a valid ordered collection and rejects malformed or duplicate entries", () => {
    expect(readAbilityUses([first, second])).toEqual([first, second]);
    expect(readAbilityUses([{ ...first, id: "" }])).toBeNull();
    expect(readAbilityUses([first, { ...second, id: "first" }])).toBeNull();
    expect(readAbilityUses([{ ...first, minimumLevel: 11 }])).toBeNull();
    expect(readAbilityUses([{ ...first, cost: { source: "none", amount: 1 } }])).toBeNull();
  });

  it("adds, patches, removes and reorders by stable id", () => {
    expect(appendAbilityUse([first], second)).toEqual([first, second]);
    expect(appendAbilityUse([first], { ...second, id: "first" })).toBeNull();
    expect(patchAbilityUse([first, second], "second", { name: "Nova" })?.[1]?.name)
      .toBe("Nova");
    expect(removeAbilityUse([first, second], "first")).toEqual([second]);
    expect(reorderAbilityUse([first, second], "second", "up")).toEqual([second, first]);
  });

  it("creates an atomic dirty-field patch and evaluates minimum level", () => {
    expect(createAbilityUsePatch(first, {
      ...first,
      description: "Nova",
      cost: { source: "determination", amount: 3 },
    })).toEqual({
      description: "Nova",
      cost: { source: "determination", amount: 3 },
    });
    expect(isAbilityUseAvailable(second, 1)).toBe(false);
    expect(isAbilityUseAvailable(second, 2)).toBe(true);
  });
});
