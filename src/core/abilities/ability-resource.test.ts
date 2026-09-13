import { describe, expect, it } from "vitest";

import {
  adjustAbilityResourceValue,
  EMPTY_ABILITY_RESOURCE,
  prepareAbilityResourceRemoval,
  readAbilityResource,
} from "./ability-resource";

describe("Ability resource", () => {
  it("adjusts current value by one within its inline editing bounds", () => {
    expect(adjustAbilityResourceValue({ value: 2, max: 3 }, -1)).toEqual({
      value: 1,
      max: 3,
    });
    expect(adjustAbilityResourceValue({ value: 2, max: 3 }, 1)).toEqual({
      value: 3,
      max: 3,
    });
    expect(adjustAbilityResourceValue({ value: 0, max: 3 }, -1)).toEqual({
      value: 0,
      max: 3,
    });
    expect(adjustAbilityResourceValue({ value: 3, max: 3 }, 1)).toEqual({
      value: 3,
      max: 3,
    });
  });

  it("decreases an over-maximum value by one without rewriting max", () => {
    expect(adjustAbilityResourceValue({ value: 5, max: 3 }, -1)).toEqual({
      value: 4,
      max: 3,
    });
    expect(adjustAbilityResourceValue({ value: 5, max: 3 }, 1)).toEqual({
      value: 5,
      max: 3,
    });
  });

  it("reads non-negative integer values without clamping value to max", () => {
    expect(readAbilityResource({ value: 5, max: 3 })).toEqual({ value: 5, max: 3 });
  });

  it.each([
    null,
    {},
    { value: -1, max: 3 },
    { value: 1.5, max: 3 },
    { value: 1, max: -1 },
    { value: 1, max: 3.5 },
  ])("rejects malformed resources (%s)", (value) => {
    expect(readAbilityResource(value)).toBeNull();
  });

  it("creates an empty resource and resets every referencing use on removal", () => {
    expect(EMPTY_ABILITY_RESOURCE).toEqual({ value: 0, max: 0 });
    const use = {
      id: "use", name: "Uso", description: "", minimumLevel: null, checkIntegration: null,
      cost: { source: "resource", amount: 2 } as const,
    };
    expect(
      prepareAbilityResourceRemoval([use], { value: 0, max: 0 }),
    ).toEqual({
      confirmationRequired: true,
      uses: [{ ...use, cost: { source: "none", amount: 0 } }],
    });
  });

  it("preserves unrelated uses and confirms only when state would be lost", () => {
    const use = {
      id: "use", name: "Uso", description: "", minimumLevel: null, checkIntegration: null,
      cost: { source: "determination", amount: 1 } as const,
    };
    expect(prepareAbilityResourceRemoval([use], { value: 0, max: 0 })).toEqual({
      confirmationRequired: false,
      uses: [use],
    });
    expect(prepareAbilityResourceRemoval([use], { value: 1, max: 3 })).toEqual({
      confirmationRequired: true,
      uses: [use],
    });
  });
});
