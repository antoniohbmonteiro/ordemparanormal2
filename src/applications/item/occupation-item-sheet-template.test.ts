import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Occupation Item Sheet template", () => {
  it("edits only native name and image identity", async () => {
    const template = await readFile(
      fileURLToPath(
        new URL("../../../templates/item/occupation-item-sheet.hbs", import.meta.url),
      ),
      "utf8",
    );
    expect(template).toContain('name="name"');
    expect(template).toContain('data-edit="img"');
    expect(template).not.toContain('name="system.');
    expect(template).not.toContain("abilityGrants");
  });
});
