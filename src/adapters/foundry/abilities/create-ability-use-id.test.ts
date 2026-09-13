import { afterEach, describe, expect, it, vi } from "vitest";

import { createAbilityUseId } from "./create-ability-use-id";

afterEach(() => vi.unstubAllGlobals());

describe("createAbilityUseId", () => {
  it("delegates to Foundry randomID", () => {
    vi.stubGlobal("foundry", { utils: { randomID: vi.fn(() => "stable-id") } });
    expect(createAbilityUseId()).toBe("stable-id");
  });
});
