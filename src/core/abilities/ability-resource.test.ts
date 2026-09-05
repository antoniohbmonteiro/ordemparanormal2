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

  it("creates an empty resource and resets a referencing cost on removal", () => {
    expect(EMPTY_ABILITY_RESOURCE).toEqual({ value: 0, max: 0 });
    expect(
      prepareAbilityResourceRemoval(
        { source: "resource", amount: 2 },
        { value: 0, max: 0 },
      ),
    ).toEqual({
      confirmationRequired: true,
      cost: { source: "none", amount: 0 },
    });
  });

  it("preserves an unrelated cost and confirms only when state would be lost", () => {
    const cost = { source: "determination", amount: 1 } as const;
    expect(prepareAbilityResourceRemoval(cost, { value: 0, max: 0 })).toEqual({
      confirmationRequired: false,
      cost,
    });
    expect(prepareAbilityResourceRemoval(cost, { value: 1, max: 3 })).toEqual({
      confirmationRequired: true,
      cost,
    });
  });
});
