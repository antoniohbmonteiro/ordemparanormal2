import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { beforeAll, describe, expect, it } from "vitest";
import translations from "../../../lang/pt-BR.json";

let render: Handlebars.TemplateDelegate;
let styles = "";
const card = {
  id: "ability-1", name: "Olhar Clínico", img: "icons/ability.webp",
  descriptionHTML: "", useForms: [], isExpanded: false, detailsId: "sheet-1-ability-1",
  resource: null,
};

beforeAll(async () => {
  const template = await readFile(new URL("../../../templates/actor/agent-sheet-abilities.hbs", import.meta.url), "utf8");
  styles = await readFile(new URL("../../../styles/agent-sheet.css", import.meta.url), "utf8");
  const handlebars = Handlebars.create();
  handlebars.registerHelper("localize", (key: string) => key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], translations));
  render = handlebars.compile(template);
});

function html(overrides: object = {}, permissions = { editable: true, canEditStructure: false }): string {
  return render({ ...permissions, agent: { abilities: [{ ...card, ...overrides }] } });
}

describe("Agent Sheet Ability rows", () => {
  it("renders the real image, fixed subtitle and accessible use surface without a resource or quantity", () => {
    const output = html();
    expect(output).toContain('src="icons/ability.webp"');
    expect(output).toContain('data-action="useAbility"');
    expect(output).toContain('aria-label="Olhar Clínico"');
    expect(output).toContain('aria-hidden="true">Usar</span>');
    expect(output).toContain('op2-ability-card__subtitle">Habilidade</span>');
    expect(output).not.toContain('class="op2-ability-card__resource"');
    expect(output).not.toContain("QTD");
    expect(output).not.toContain("useSummary");
  });

  it("renders value/max, the existing percentage and sibling resource controls", () => {
    const output = html({ resource: { value: 2, max: 3, fillPercentage: 66.67, canDecrease: true, canIncrease: true } });
    expect(output).toContain('aria-valuenow="66.67"');
    expect(output).toContain('aria-valuemax="100"');
    expect(output).toContain('aria-valuetext="2 / 3"');
    expect(output).toContain('width: 66.67%;');
    expect(output).toContain('data-action="decreaseAbilityResource"');
    expect(output).toContain('data-action="increaseAbilityResource"');
    const use = output.match(/<button class="op2-ability-card__use"[\s\S]*?<\/button>/)?.[0];
    expect(use).not.toContain("resource");
    expect(use).not.toContain("toggleAbilityDescription");
    expect(use).not.toContain("details");
  });

  it("preserves adjustment limits and hides editing controls without permission", () => {
    const resource = { value: 0, max: 3, fillPercentage: 0, canDecrease: false, canIncrease: true };
    expect(html({ resource })).toMatch(/data-action="decreaseAbilityResource"[^>]*disabled/);
    const readOnly = html({ resource }, { editable: false, canEditStructure: false });
    expect(readOnly).toMatch(/data-action="useAbility"[^>]*disabled/);
    expect(readOnly).not.toContain('data-action="decreaseAbilityResource"');
    expect(readOnly).not.toContain('data-action="increaseAbilityResource"');
    expect(readOnly).not.toContain("menu-trigger");
    expect(readOnly).toContain('data-action="toggleAbilityDescription"');
  });

  it("starts collapsed and renders enriched descriptions only when present", () => {
    const collapsed = html();
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('aria-controls="sheet-1-ability-1"');
    expect(collapsed).toContain('id="sheet-1-ability-1" hidden');
    expect(collapsed).not.toContain('class="op2-ability-card__description"');
    const expanded = html({ isExpanded: true, descriptionHTML: '<p>Leia <a href="#entry">a pista</a>.</p>' });
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).not.toContain('id="sheet-1-ability-1" hidden');
    expect(expanded).toContain('<a href="#entry">a pista</a>');
  });

  it("renders ordered forms as a light list, including check integration and empty descriptions", () => {
    const output = html({ isExpanded: true, useForms: [
      { id: "first", name: "Identificar", descriptionHTML: "<p>Descrição enriquecida</p>", isCheckIntegrated: false },
      { id: "second", name: "Interpretar", descriptionHTML: "", isCheckIntegrated: true },
    ] });
    expect(output).toContain("Formas de Uso");
    expect(output.indexOf("Identificar")).toBeLessThan(output.indexOf("Interpretar"));
    expect(output).toContain("Disponível nos checks");
    expect(output.match(/class="op2-ability-card__description"/g)).toHaveLength(1);
  });

  it("replaces the chevron with the existing menu trigger only in Edit Mode", () => {
    const output = html({}, { editable: true, canEditStructure: true });
    expect(output).toContain("op2-ability-card__menu-trigger");
    expect(output).toContain('aria-haspopup="menu"');
    expect(output).not.toContain('data-action="toggleAbilityDescription"');
    expect(html()).not.toContain("menu-trigger");
  });

  it("keeps hover/focus overlays out of structural sizing and scopes changes to Abilities", () => {
    const controls = styles.match(/\.op2-ability-card__resource-controls \{([^}]+)\}/)?.[1];
    expect(controls).toContain("position: absolute");
    expect(controls).toContain("width: 130px");
    expect(controls).toContain("opacity: 0");
    expect(styles).toContain(".op2-ability-card__resource:focus-within");
    expect(styles).toContain(".op2-ability-card__use:focus-visible");
    expect(styles).toContain(".op2-ability-card__details[hidden]");
    expect(styles).toContain("overflow-wrap: anywhere");
  });
});
