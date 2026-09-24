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
        AnyField: MockField,
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
      information: MockArrayField;
      skills: MockField;
    };

    expect(Object.keys(schema)).toEqual([
      "publicDescription",
      "gmContext",
      "information",
      "skills",
    ]);
    expect(schema.publicDescription.options).toMatchObject({
      blank: true,
      initial: "",
    });
    expect(schema.gmContext.options).toMatchObject({ blank: true, initial: "" });
    expect(schema.skills.options).toMatchObject({ required: false });
    expect(schema.skills.options).not.toHaveProperty("initial");
  });

  it("models ordered information and approaches with canonical constraints", () => {
    const schema = PointOfInterestDataModel.defineSchema() as unknown as {
      information: MockArrayField;
    };
    const { information } = schema;

    expect(information.options).toMatchObject({ initial: [] });
    expect(typeof information.options.validate).toBe("function");

    const entry = information.element;
    expect(Object.keys(entry.fields)).toEqual([
      "id",
      "content",
      "approaches",
    ]);
    expect(entry.fields.id.options).toMatchObject({ blank: false });
    expect(entry.fields.content.options).toMatchObject({ blank: true });
    const approaches = entry.fields.approaches as unknown as MockArrayField;
    expect(approaches.options).toMatchObject({ min: 1 });
    expect(approaches.element.fields.skill.options.choices).toEqual([...SKILL_KEYS]);
    expect(approaches.element.fields.difficulty.options).toMatchObject({
      integer: true,
      min: 1,
    });
    expect(approaches.element.fields.difficulty.options).not.toHaveProperty("max");
    expect(approaches.element.fields.showDifficultyToPlayers.options).toMatchObject({ initial: false });
    expect(approaches.element.fields.specialization.options).toMatchObject({ required: false });
  });

  it("rejects duplicate IDs, empty approaches and duplicate semantic approaches", () => {
    const schema = PointOfInterestDataModel.defineSchema() as unknown as {
      information: MockArrayField;
    };
    const validate = schema.information.options.validate as (
      value: unknown,
    ) => boolean;
    const approach = { skill: "crime", difficulty: 6, showDifficultyToPlayers: false };
    const entry = { id: "a", content: "", approaches: [approach] };
    expect(validate([entry])).toBe(true);
    expect(validate([{ ...entry, approaches: [{ ...approach, specialization: undefined }] }])).toBe(true);
    expect(validate([entry, entry])).toBe(false);
    expect(validate([{ ...entry, approaches: [] }])).toBe(false);
    expect(validate([{ ...entry, approaches: [approach, approach] }])).toBe(false);
  });

  it("does not convert legacy data in migrateData, including partial updates", () => {
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
