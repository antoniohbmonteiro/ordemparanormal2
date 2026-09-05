import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Equipment Item Sheet description", () => {
  it("uses Foundry's ApplicationV2 ProseMirror element without changing the data field", async () => {
    const [sheet, template, dataModel] = await Promise.all([
      readFile(
        fileURLToPath(new URL("./equipment-item-sheet.ts", import.meta.url)),
        "utf8",
      ),
      readFile(
        fileURLToPath(
          new URL("../../../templates/item/equipment-item-sheet.hbs", import.meta.url),
        ),
        "utf8",
      ),
      readFile(
        fileURLToPath(
          new URL("../../documents/item/equipment-data-model.ts", import.meta.url),
        ),
        "utf8",
      ),
    ]);

    expect(template).toContain("<prose-mirror");
    expect(template).toContain('name="system.description"');
    expect(template).toContain('value="{{equipment.description}}"');
    expect(template).toContain('toggled="true"');
    expect(template).toContain("{{{equipment.enrichedDescription}}}");
    expect(template).not.toContain("{{editor ");
    expect(template).not.toContain('<textarea name="system.description"');
    expect(sheet).toContain("TextEditor.implementation.enrichHTML(");
    expect(sheet).toContain("relativeTo: item");
    expect(dataModel).toContain(
      "description: new foundry.data.fields.StringField({",
    );
    expect(dataModel).not.toContain(
      "description: new foundry.data.fields.HTMLField({",
    );
  });
});
