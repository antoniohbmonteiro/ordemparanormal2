import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

let template = "";

beforeAll(async () => {
  const templatePath = fileURLToPath(
    new URL(
      "../../../templates/actor/agent-sheet-abilities.hbs",
      import.meta.url,
    ),
  );
  template = await readFile(templatePath, "utf8");
});

describe("Agent Sheet Ability card template", () => {
  it("uses one full-card semantic surface behind the visible content", () => {
    const useSurface = template.match(
      /<button class="op2-ability-card__use"[\s\S]*?<\/button>/,
    )?.[0];

    expect(useSurface).toBeDefined();
    expect(useSurface).toContain('data-action="useAbility"');
    expect(useSurface).toContain('aria-label="{{name}}"');
    expect(useSurface).not.toContain("<img");

    const useEnd = template.indexOf("</button>");
    expect(template.indexOf("op2-ability-card__identity")).toBeGreaterThan(
      useEnd,
    );
    expect(template.indexOf("op2-ability-card__name")).toBeGreaterThan(useEnd);
    expect(template.indexOf("op2-ability-card__cost")).toBeGreaterThan(useEnd);
  });

  it("renders the optional resource and inline adjustment controls", () => {
    const resourceBlock = template.match(
      /<div class="op2-ability-card__resource">([\s\S]*?)<\/div>/,
    )?.[1];

    expect(resourceBlock).toBeDefined();
    expect(resourceBlock).toContain(
      'aria-valuenow="{{resource.fillPercentage}}"',
    );
    expect(resourceBlock).toContain(
      'style="width: {{resource.fillPercentage}}%;"',
    );
    expect(resourceBlock).toContain(
      "{{resource.value}} / {{resource.max}}",
    );
    expect(resourceBlock).toContain('data-action="decreaseAbilityResource"');
    expect(resourceBlock).toContain('data-action="increaseAbilityResource"');
    expect(resourceBlock).toContain("resource.canDecrease");
    expect(resourceBlock).toContain("resource.canIncrease");
    expect(resourceBlock).toContain("{{#if @root.editable}}");
  });

  it("keeps resource controls and the actions trigger outside the use surface", () => {
    const useEnd = template.indexOf("</button>");
    const resourceStart = template.indexOf("op2-ability-card__resource");
    const menuStart = template.indexOf("op2-ability-card__menu-trigger");

    expect(useEnd).toBeGreaterThan(0);
    expect(resourceStart).toBeGreaterThan(useEnd);
    expect(menuStart).toBeGreaterThan(useEnd);
    expect(template).toContain("fa-ellipsis-vertical");
    expect(template).toContain('aria-haspopup="menu"');
    expect(template).toContain("{{#if @root.canEditStructure}}");
  });

  it("does not render an explicit Use control or reserve description height", () => {
    expect(template).not.toContain("AgentSheet.Abilities.Use");
    expect(template).not.toContain("op2-ability-card__description");
    expect(template).not.toContain("editAbility");
  });
});
