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
      showDifficultiesToPlayers: MockField;
      information: MockArrayField;
    };

    expect(Object.keys(schema)).toEqual([
      "publicDescription",
      "gmContext",
      "showDifficultiesToPlayers",
      "information",
    ]);
    expect(schema.publicDescription.options).toMatchObject({
      blank: true,
      initial: "",
    });
    expect(schema.gmContext.options).toMatchObject({ blank: true, initial: "" });
    expect(schema.showDifficultiesToPlayers.options).toMatchObject({
      initial: false,
    });
  });

  it("models information as an array of stable, skill-gated entries", () => {
    const schema = PointOfInterestDataModel.defineSchema() as unknown as {
      information: MockArrayField;
    };
    const { information } = schema;

    expect(information.options).toMatchObject({ initial: [] });
    expect(typeof information.options.validate).toBe("function");

    const entry = information.element;
    expect(Object.keys(entry.fields)).toEqual([
      "id",
      "skill",
      "difficulty",
      "content",
    ]);
    expect(entry.fields.id.options).toMatchObject({ blank: false });
    expect(entry.fields.skill.options.choices).toEqual([...SKILL_KEYS]);
    expect(entry.fields.difficulty.options).toMatchObject({
      integer: true,
      min: 1,
    });
    expect(entry.fields.difficulty.options).not.toHaveProperty("max");
    expect(entry.fields.content.options).toMatchObject({ blank: true });
  });

  it("rejects a repeated information id through the array validator", () => {
    const schema = PointOfInterestDataModel.defineSchema() as unknown as {
      information: MockArrayField;
    };
    const validate = schema.information.options.validate as (
      value: unknown,
    ) => boolean;

    expect(validate([{ id: "a" }, { id: "b" }])).toBe(true);
    expect(validate([{ id: "a" }, { id: "a" }])).toBe(false);
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
