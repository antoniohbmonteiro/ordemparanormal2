import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

let template: string;

beforeAll(async () => {
  template = await readFile(
    fileURLToPath(
      new URL(
        "../../../templates/item/point-of-interest-item-sheet.hbs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
});

describe("Point of Interest Item Sheet template", () => {
  it("gates the whole authoring UI behind canViewAuthoring", () => {
    expect(template).toContain("{{#if canViewAuthoring}}");
    const elseArm = template.slice(template.lastIndexOf("{{else}}"));
    expect(elseArm).toContain(
      "ORDEMPARANORMAL2.PointOfInterestSheet.GmOnly",
    );
    expect(elseArm).not.toContain("poi.");
  });

  it("edits identity and rich text through native/ProseMirror bindings", () => {
    expect(template).toContain('<input type="text" name="name"');
    expect(template).toContain('data-edit="img"');
    expect(template).toContain('<prose-mirror name="system.publicDescription"');
    expect(template).toContain('<prose-mirror name="system.gmContext"');
  });

  it("renders the skill / DT / information table with per-row skill options", () => {
    expect(template).toContain(
      "ORDEMPARANORMAL2.PointOfInterestSheet.Table.Skill",
    );
    expect(template).toContain(
      "ORDEMPARANORMAL2.PointOfInterestSheet.Table.Difficulty",
    );
    expect(template).toContain(
      "ORDEMPARANORMAL2.PointOfInterestSheet.Table.Information",
    );
    expect(template).toContain('data-action="addInformation"');
    expect(template).toContain('data-action="removeInformation"');
    expect(template).toContain('data-information-field="skill"');
    expect(template).toContain('data-information-field="difficulty"');
    expect(template).toContain('data-information-field="content"');

    const eachRows = template.indexOf("{{#each poi.information}}");
    const eachOptions = template.indexOf("{{#each skillOptions}}");
    expect(eachRows).toBeGreaterThan(-1);
    expect(eachOptions).toBeGreaterThan(eachRows);
  });

  it("keeps the DT-visibility toggle on its own selector", () => {
    expect(template).toContain("data-difficulty-visibility-edit");
    const toggleLine = template
      .split("\n")
      .find((line) => line.includes("data-difficulty-visibility-edit"));
    expect(toggleLine).toBeDefined();
    expect(toggleLine).not.toContain("data-information-edit");
  });

  it("never exposes the entry id as an editable field or execution state", () => {
    expect(template).not.toContain('data-information-field="id"');
    expect(template).not.toContain("discovered");
  });
});
