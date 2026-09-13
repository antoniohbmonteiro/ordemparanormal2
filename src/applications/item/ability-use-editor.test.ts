import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("AbilityUseEditor", () => {
  it("uses a native ApplicationV2 form and keeps rich text in a local draft", async () => {
    const [source, template, localizationSource] = await Promise.all([
      readFile(fileURLToPath(new URL("./ability-use-editor.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../templates/item/ability-use-editor.hbs", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url)), "utf8"),
    ]);
    const localization = JSON.parse(localizationSource) as {
      ORDEMPARANORMAL2: { AbilitySheet: { CostSources: Record<string, string> } };
    };
    expect(source).toContain("HandlebarsApplicationMixin(ApplicationV2)");
    expect(source).toContain('tag: "form"');
    expect(source).toContain("saveExistingAbilityUse(");
    expect(source).toContain("moveAbilityUse(");
    expect(source).toContain("deleteAbilityUse(");
    expect(template).toContain("<prose-mirror");
    expect(template).toContain('name="description"');
    expect(template).toContain('name="minimumLevel"');
    expect(template).not.toContain('name="system.uses');
    expect(source).toContain("ABILITY_COST_SOURCES.map");
    expect(source).toContain('disabled: source === "resource" && !hasResource');
    expect(localization.ORDEMPARANORMAL2.AbilitySheet.CostSources).toEqual({
      none: "Sem custo",
      health: "PV",
      determination: "PD",
      resource: "Recurso",
    });
  });
});
