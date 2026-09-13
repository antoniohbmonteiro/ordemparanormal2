import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("AbilityUseEditor", () => {
  it("uses a native ApplicationV2 form and keeps rich text in a local draft", async () => {
    const [source, template] = await Promise.all([
      readFile(fileURLToPath(new URL("./ability-use-editor.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../templates/item/ability-use-editor.hbs", import.meta.url)), "utf8"),
    ]);
    expect(source).toContain("HandlebarsApplicationMixin(ApplicationV2)");
    expect(source).toContain('tag: "form"');
    expect(source).toContain("saveExistingAbilityUse(");
    expect(source).toContain("moveAbilityUse(");
    expect(source).toContain("deleteAbilityUse(");
    expect(template).toContain("<prose-mirror");
    expect(template).toContain('name="description"');
    expect(template).toContain('name="minimumLevel"');
    expect(template).not.toContain('name="system.uses');
  });
});
