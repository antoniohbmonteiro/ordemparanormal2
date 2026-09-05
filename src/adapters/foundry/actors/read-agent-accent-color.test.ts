import { describe, expect, it, vi } from "vitest";

import { readAgentAccentColor } from "./read-agent-accent-color";

function actor(system: unknown, profileColors: readonly unknown[]) {
  return {
    system,
    getEmbeddedCollection: vi.fn(() =>
      profileColors.map((accentColor) => ({
        type: "profile",
        system: { accentColor },
      })),
    ),
  } as unknown as foundry.documents.Actor;
}

describe("readAgentAccentColor", () => {
  it("reads the only current Profile when the Agent has no override", () => {
    expect(readAgentAccentColor(actor({}, ["#4176BA"]))).toBe("#4176BA");
  });

  it("uses the system default for a missing or conflicting Profile", () => {
    expect(readAgentAccentColor(actor({}, []))).toBe("#7F252B");
    expect(
      readAgentAccentColor(actor({}, ["#4176BA", "#AE2C12"])),
    ).toBe("#7F252B");
  });

  it("keeps a persisted Agent color even when Profiles conflict", () => {
    expect(
      readAgentAccentColor(
        actor(
          { appearance: { accentColor: "#010203" } },
          ["#4176BA", "#AE2C12"],
        ),
      ),
    ).toBe("#010203");
  });
});
