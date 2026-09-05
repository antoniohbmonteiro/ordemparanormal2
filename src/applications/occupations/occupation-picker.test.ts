import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Occupation picker wrapper", () => {
  it("binds the shared picker to Occupation-specific catalog, operations, and localization", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./occupation-picker.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("SingleEmbeddedItemPicker");
    expect(source).toContain("ORDEMPARANORMAL2.OccupationPicker");
    expect(source).toContain("loadAvailableOccupations");
    expect(source).toContain("getAgentOccupation");
    expect(source).toContain("setAgentOccupation");
    expect(source).toContain("clearAgentOccupation");
  });
});
