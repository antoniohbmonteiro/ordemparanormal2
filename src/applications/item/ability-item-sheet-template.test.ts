import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Ability Item Sheet description", () => {
  it("uses Foundry's ApplicationV2 ProseMirror element without changing the data field", async () => {
    const [sheet, template, dataModel, stylesheet] = await Promise.all([
      readFile(
        fileURLToPath(new URL("./ability-item-sheet.ts", import.meta.url)),
        "utf8",
      ),
      readFile(
        fileURLToPath(
          new URL("../../../templates/item/ability-item-sheet.hbs", import.meta.url),
        ),
        "utf8",
      ),
      readFile(
        fileURLToPath(
          new URL("../../documents/item/ability-data-model.ts", import.meta.url),
        ),
        "utf8",
      ),
      readFile(
        fileURLToPath(
          new URL("../../../styles/ability-item-sheet.css", import.meta.url),
        ),
        "utf8",
      ),
    ]);

    expect(template).toContain("<prose-mirror");
    expect(template).toContain('name="system.description"');
    expect(template).toContain('value="{{ability.description}}"');
    expect(template).toContain('toggled="true"');
    expect(template).toContain("{{{ability.enrichedDescription}}}");
    expect(template).not.toContain("{{editor ");
    expect(template).not.toContain('<textarea name="system.description"');
    expect(sheet).toContain("TextEditor.implementation.enrichHTML(");
    expect(sheet).toContain("relativeTo: item");
    expect(sheet).toContain("static override TABS");
    expect(template).toContain('data-group="sheet"');
    expect(template).toContain('data-tab="general"');
    expect(template).toContain('data-tab="uses"');
    expect(template).toContain('data-action="tab"');
    expect(sheet).not.toContain("_onClickTab");
    expect(template).not.toContain('name="system.cost');
    expect(dataModel).toContain("description: new foundry.data.fields.HTMLField({");
    expect(dataModel).toContain("uses: new foundry.data.fields.ArrayField(");
    expect(stylesheet).toContain(
      ".ordemparanormal2.ability-item-sheet .op2-ability-sheet__use",
    );
    expect(stylesheet).toContain(
      "height:auto; min-height:0; box-sizing:border-box;",
    );
  });
});
