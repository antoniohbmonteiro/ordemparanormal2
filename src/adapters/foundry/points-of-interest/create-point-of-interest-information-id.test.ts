import { afterEach, describe, expect, it, vi } from "vitest";

import { createPointOfInterestInformationId } from "./create-point-of-interest-information-id";

afterEach(() => vi.unstubAllGlobals());

describe("createPointOfInterestInformationId", () => {
  it("delegates to Foundry randomID", () => {
    const randomID = vi.fn(() => "generated-information-id");
    vi.stubGlobal("foundry", { utils: { randomID } });

    expect(createPointOfInterestInformationId()).toBe("generated-information-id");
    expect(randomID).toHaveBeenCalledOnce();
  });
});
