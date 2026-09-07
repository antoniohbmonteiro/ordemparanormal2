import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SKILL_KEYS } from "../../config/skills";

class MockField {
  constructor(readonly options: Record<string, unknown> = {}) {}
}
class MockSchemaField {
  constructor(
    readonly fields: Record<string, MockField>,
    readonly options: Record<string, unknown> = {},
  ) {}
}
class MockArrayField {
  constructor(
    readonly element: MockSchemaField,
    readonly options: Record<string, unknown> = {},
  ) {}
}
class MockTypeDataModel {}

let PointOfInterestDataModel: typeof import("./point-of-interest-data-model").PointOfInterestDataModel;

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: MockTypeDataModel },
    data: {
      fields: {
        ArrayField: MockArrayField,
        BooleanField: MockField,
        NumberField: MockField,
        SchemaField: MockSchemaField,
        StringField: MockField,
      },
    },
  });
  ({ PointOfInterestDataModel } = await import("./point-of-interest-data-model"));
});

afterAll(() => vi.unstubAllGlobals());

describe("PointOfInterestDataModel", () => {
  it("defines exactly the definition fields, no execution state", () => {
    const schema = PointOfInterestDataModel.defineSchema() as unknown as {
      publicDescription: MockField;
      gmContext: MockField;
      skills: MockArrayField;
    };

    expect(Object.keys(schema)).toEqual([
      "publicDescription",
      "gmContext",
      "skills",
    ]);
    expect(schema.publicDescription.options).toMatchObject({
      blank: true,
      initial: "",
    });
    expect(schema.gmContext.options).toMatchObject({ blank: true, initial: "" });
  });

  it("models 0..N unique skill groups containing 1..N information", () => {
    const schema = PointOfInterestDataModel.defineSchema() as unknown as {
      skills: MockArrayField;
    };
    const { skills } = schema;

    expect(skills.options).toMatchObject({ initial: [] });
    expect(typeof skills.options.validate).toBe("function");

    const group = skills.element;
    expect(Object.keys(group.fields)).toEqual([
      "skill",
      "information",
    ]);
    expect(group.fields.skill.options.choices).toEqual([...SKILL_KEYS]);

    const information = group.fields.information as unknown as MockArrayField;
    expect(information.options).toMatchObject({ initial: [], min: 1 });
    const entry = information.element;
    expect(Object.keys(entry.fields)).toEqual([
      "id",
      "difficulty",
      "content",
      "showDifficultyToPlayers",
    ]);
    expect(entry.fields.id.options).toMatchObject({ blank: false });
    expect(entry.fields.difficulty.options).toMatchObject({
      integer: true,
      min: 1,
    });
    expect(entry.fields.difficulty.options).not.toHaveProperty("max");
    expect(entry.fields.content.options).toMatchObject({ blank: true });
    expect(entry.fields.showDifficultyToPlayers.options).toMatchObject({ initial: false });
  });

  it("rejects duplicate skills, empty groups, and repeated information ids", () => {
    const schema = PointOfInterestDataModel.defineSchema() as unknown as {
      skills: MockArrayField;
    };
    const validate = schema.skills.options.validate as (
      value: unknown,
    ) => boolean;

    expect(validate([
      { skill: "crime", information: [{ id: "a" }, { id: "b" }] },
      { skill: "perception", information: [{ id: "c" }] },
    ])).toBe(true);
    expect(validate([
      { skill: "crime", information: [{ id: "a" }] },
      { skill: "crime", information: [{ id: "b" }] },
    ])).toBe(false);
    expect(validate([{ skill: "crime", information: [] }])).toBe(false);
    expect(validate([
      { skill: "crime", information: [{ id: "a" }] },
      { skill: "perception", information: [{ id: "a" }] },
    ])).toBe(false);
  });

  it("does not override migrateData (no backfill; type never shipped)", () => {
    expect(
      Object.prototype.hasOwnProperty.call(
        PointOfInterestDataModel,
        "migrateData",
      ),
    ).toBe(false);
  });
});

describe("Point of Interest manifest declaration", () => {
  it("declares its rich-text fields and bundles its stylesheet", async () => {
    const manifest = JSON.parse(
      await readFile(
        fileURLToPath(new URL("../../../system.json", import.meta.url)),
        "utf8",
      ),
    ) as {
      documentTypes: { Item: Record<string, { htmlFields?: string[] }> };
      styles: string[];
    };

    expect(manifest.documentTypes.Item.pointOfInterest.htmlFields).toEqual([
      "publicDescription",
      "gmContext",
    ]);
    expect(manifest.styles).toContain(
      "styles/point-of-interest-item-sheet.css",
    );
  });
});
