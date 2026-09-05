import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

let applicationSource = "";
let template = "";
let identityTemplate = "";
let skillsTemplate = "";
let dieControlTemplate = "";
let styles = "";

beforeAll(async () => {
  const [application, mainTemplate, sheetStyles, identity, skills, dieControl] = await Promise.all([
    readFile(fileURLToPath(new URL("./agent-sheet.ts", import.meta.url)), "utf8"),
    readFile(
      fileURLToPath(
        new URL(
          "../../../templates/actor/agent-sheet.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
    readFile(
      fileURLToPath(new URL("../../../styles/agent-sheet.css", import.meta.url)),
      "utf8",
    ),
    readFile(
      fileURLToPath(
        new URL(
          "../../../templates/actor/agent-sheet-identity.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
    readFile(
      fileURLToPath(
        new URL(
          "../../../templates/actor/agent-sheet-skills.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
    readFile(
      fileURLToPath(
        new URL(
          "../../../templates/actor/partials/die-step-select.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  ]);
  applicationSource = application;
  template = mainTemplate;
  identityTemplate = identity;
  skillsTemplate = skills;
  dieControlTemplate = dieControl;
  styles = sheetStyles;
});

describe("Agent Sheet main template", () => {
  it("keeps only the three primary content tabs", () => {
    const tabIds = [...applicationSource.matchAll(/\{ id: "([^"]+)"/g)].map(
      ([, id]) => id,
    );

    expect(tabIds).toEqual(["abilities", "inventory", "notes"]);
    expect(template).not.toContain('data-tab="skills"');
  });

  it("renders Skills exactly once in a permanent aside", () => {
    const skillsPartial =
      'systems/ordemparanormal2/templates/actor/agent-sheet-skills.hbs';
    const aside = template.match(
      /<aside class="op2-skills-dock op2-panel">([\s\S]*?)<\/aside>/,
    )?.[1];

    expect(template.split(skillsPartial)).toHaveLength(2);
    expect(aside).toContain(skillsPartial);
  });

  it("contains no legacy Skills dock modes or toggle action", () => {
    for (const legacyMarker of [
      "skillsMode",
      "skillsClosed",
      "skillsHalf",
      "skillsFull",
      "toggleSkillsDock",
      "op2-agent-layout--skills-",
    ]) {
      expect(template).not.toContain(legacyMarker);
      expect(applicationSource).not.toContain(legacyMarker);
    }
  });

  it("renders Profile and Occupation through their single picker controls", () => {
    expect(identityTemplate).toContain('data-action="openProfilePicker"');
    expect(identityTemplate).toContain('data-action="openOccupationPicker"');
    expect(identityTemplate).toContain(
      'class="op2-identity-item-control__display"',
    );
    expect(identityTemplate).not.toContain('data-action="editProfile"');
    expect(identityTemplate).not.toContain('data-action="editOccupation"');
    expect(applicationSource).not.toContain("editProfile:");
    expect(applicationSource).not.toContain("editOccupation:");
    expect(identityTemplate).not.toContain('name="system.occupation"');
  });

  it("presents structural identity as information outside Edit Mode", () => {
    expect(identityTemplate).toContain(
      '<h1 class="op2-identity__name">{{agent.name}}</h1>',
    );
    expect(identityTemplate).toContain('name="name"');
    expect(identityTemplate).toContain(
      '<span class="op2-field__value">{{agent.level}}</span>',
    );
    expect(identityTemplate).toContain('name="system.level"');
    expect(identityTemplate).toContain("{{#if canEditStructure}}");
    expect(identityTemplate).not.toContain(
      'data-action="openProfilePicker" disabled',
    );
    expect(identityTemplate).not.toContain(
      'data-action="openOccupationPicker" disabled',
    );
  });

  it("renders an accessible permission-gated Edit Mode toggle", () => {
    expect(identityTemplate).toContain('data-action="toggleEditMode"');
    expect(identityTemplate).toContain('aria-pressed="{{editMode}}"');
    expect(identityTemplate).toContain("AgentSheet.Actions.EnableEditMode");
    expect(identityTemplate).toContain("AgentSheet.Actions.DisableEditMode");
    expect(applicationSource).toContain(
      "canEditStructure: this.#canEditStructure",
    );
    expect(applicationSource).toMatch(
      /#onToggleEditMode[\s\S]*?await this\.#documentUpdateQueue;[\s\S]*?this\.editMode = !this\.editMode;[\s\S]*?await this\.render\(\{ force: true \}\);/,
    );
  });

  it("keeps die pills informational until structural editing is enabled", () => {
    expect(dieControlTemplate).toContain("{{#if editable}}");
    expect(dieControlTemplate).toContain("op2-die-control__chevron");
    expect(dieControlTemplate).toContain("op2-die-control__select");
    expect(dieControlTemplate).not.toContain("is-disabled");
    expect(dieControlTemplate).not.toContain(" disabled");
    expect(dieControlTemplate).toContain(
      '{{#if editable}} aria-hidden="true"{{/if}}',
    );
    expect(identityTemplate).toContain("editable=@root.canEditStructure");
    expect(skillsTemplate).toContain("editable=@root.canEditStructure");
    expect(skillsTemplate).not.toContain("editable=@root.editable");
  });

  it("keeps PV and PD governed by Foundry edit permission", () => {
    const resourceBlock = identityTemplate.match(
      /<section class="op2-resources"[\s\S]*?<\/section>/,
    )?.[0];

    expect(resourceBlock).toContain("{{#unless @root.editable}} disabled");
    expect(resourceBlock).not.toContain("canEditStructure");
  });

  it("derives decorative variants from the per-sheet accent", () => {
    expect(styles).toContain("--op2-accent: #7f252b;");
    expect(styles).toContain(
      "--op2-accent-bright: color-mix(in srgb, var(--op2-accent)",
    );
    expect(styles).toContain("--op2-accent-soft: color-mix(");
    expect(styles).toContain("--op2-focus: color-mix(");
    expect(styles).not.toContain("rgba(127,37,43");
    expect(styles).not.toContain("rgba(220,104,112");
  });
});
