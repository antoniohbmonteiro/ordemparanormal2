import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("SingleEmbeddedItemPicker boundaries", () => {
  it("keeps domain imports in the specific wrappers", async () => {
    const [shared, profile, occupation] = await Promise.all([
      readFile(fileURLToPath(new URL("./single-embedded-item-picker.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../profiles/profile-picker.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../occupations/occupation-picker.ts", import.meta.url)), "utf8"),
    ]);
    expect(shared).not.toContain("features/profiles");
    expect(shared).not.toContain("features/occupations");
    expect(profile).toContain("getAgentProfile");
    expect(profile).toContain("setAgentProfile");
    expect(occupation).toContain("getAgentOccupation");
    expect(occupation).toContain("setAgentOccupation");
  });

  it("keeps each catalog entry's visual content inside its click target", async () => {
    const stylesheet = await readFile(
      fileURLToPath(
        new URL("../../../styles/single-embedded-item-picker.css", import.meta.url),
      ),
      "utf8",
    );

    expect(stylesheet).toMatch(
      /\.op2-single-item-picker__entry\s*\{[^}]*height:\s*auto;/s,
    );
    expect(stylesheet).toMatch(
      /\.op2-single-item-picker__entry\s*\{[^}]*min-height:\s*calc\(42px \+ \.9rem\);/s,
    );
    expect(stylesheet).toMatch(
      /\.op2-single-item-picker__entry\s*>\s*\*\s*\{\s*pointer-events:\s*none;/s,
    );
  });
});
