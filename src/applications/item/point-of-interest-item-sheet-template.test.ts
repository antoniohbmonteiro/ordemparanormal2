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

  it("renders information cards with approach controls", () => {
    expect(template).toContain(
      "ORDEMPARANORMAL2.PointOfInterestSheet.Table.Difficulty",
    );
    expect(template).toContain(
      "ORDEMPARANORMAL2.PointOfInterestSheet.Table.Information",
    );
    expect(template).toContain('data-action="addInformation"');
    expect(template).toContain('data-action="removeInformation"');
    expect(template).toContain('data-action="addApproach"');
    expect(template).toContain('data-action="removeApproach"');
    expect(template).toContain('data-poi-edit="skill"');
    expect(template).toContain('data-poi-edit="specialization"');
    expect(template).toContain('data-poi-edit="difficulty"');
    expect(template).toContain('data-poi-edit="content"');
    expect(template.indexOf("{{#each approaches}}")).toBeGreaterThan(template.indexOf("{{#each poi.information}}"));
  });

  it("keeps difficulty visibility on each approach", () => {
    expect(template).toContain('data-poi-edit="showDifficultyToPlayers"');
  });

  it("never exposes the entry id as an editable field or execution state", () => {
    expect(template).not.toContain('data-poi-edit="id"');
    expect(template).not.toContain("discovered");
  });
});
