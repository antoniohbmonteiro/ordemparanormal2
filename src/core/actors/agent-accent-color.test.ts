import { describe, expect, it } from "vitest";

import {
  SYSTEM_DEFAULT_ACCENT_COLOR,
  isCanonicalAccentColor,
  normalizeAccentColor,
  readStoredAgentAccentColor,
  resolveEffectiveAgentAccentColor,
} from "./agent-accent-color";

describe("Agent accent color", () => {
  it.each([
    ["#4176BA", "#4176BA"],
    ["#ae2c12", "#AE2C12"],
    ["#4b7E2f", "#4B7E2F"],
  ])("normalizes %s to canonical #RRGGBB", (input, expected) => {
    expect(normalizeAccentColor(input)).toBe(expected);
    expect(isCanonicalAccentColor(expected)).toBe(true);
  });

  it.each([
    "4176BA",
    "#FFF",
    "#4176BAFF",
    " #4176BA",
    "#4176BA ",
    "rgb(65, 118, 186)",
    "blue",
    "var(--color)",
    "",
    null,
    undefined,
  ])("rejects non-#RRGGBB input %j", (input) => {
    expect(normalizeAccentColor(input)).toBeNull();
    expect(isCanonicalAccentColor(input)).toBe(false);
  });

  it("resolves Agent, then Profile, then system default precedence", () => {
    expect(
      resolveEffectiveAgentAccentColor(
        { appearance: { accentColor: "#123456" } },
        { accentColor: "#654321" },
      ),
    ).toBe("#123456");
    expect(
      resolveEffectiveAgentAccentColor({}, { accentColor: "#654321" }),
    ).toBe("#654321");
    expect(resolveEffectiveAgentAccentColor({}, {})).toBe(
      SYSTEM_DEFAULT_ACCENT_COLOR,
    );
  });

  it("treats a missing or invalid persisted Agent color as absent", () => {
    expect(readStoredAgentAccentColor({})).toBeNull();
    expect(
      readStoredAgentAccentColor({ appearance: { accentColor: "red" } }),
    ).toBeNull();
  });
});
