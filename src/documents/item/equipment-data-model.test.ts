import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class MockField { constructor(readonly options: Record<string, unknown> = {}) {} }
class MockArrayField {
  constructor(readonly element: MockSchemaField, readonly options: Record<string, unknown> = {}) {}
}
class MockSchemaField {
  constructor(
    readonly fields: Record<string, MockField>,
    readonly options: Record<string, unknown> = {},
  ) {}
}
class MockTypeDataModel { static validateJoint(_data: unknown) {} }
let EquipmentDataModel: typeof import("./equipment-data-model").EquipmentDataModel;

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: MockTypeDataModel },
    data: { fields: {
      ArrayField: MockArrayField,
      BooleanField: MockField,
      NumberField: MockField,
      SchemaField: MockSchemaField,
      StringField: MockField,
    } },
  });
  ({ EquipmentDataModel } = await import("./equipment-data-model"));
});

afterAll(() => vi.unstubAllGlobals());

describe("EquipmentDataModel", () => {
  it("defines category, description and one optional uses counter", () => {
    const schema = EquipmentDataModel.defineSchema() as unknown as {
      category: MockField;
      description: MockField;
      uses: MockSchemaField;
    };
    expect(Object.keys(schema)).toEqual(["category", "description", "uses", "useForms"]);
    expect(schema.category.options).toMatchObject({
      choices: ["general", "weapon", "tool"],
      initial: "general",
    });
    expect(schema.description.options).toMatchObject({ blank: true, initial: "" });
    expect(schema.uses.options).toMatchObject({
      required: true,
      nullable: true,
      initial: null,
    });
    expect(Object.keys(schema.uses.fields)).toEqual(["value", "max"]);
    expect(schema.uses.fields.value.options).toMatchObject({ integer: true, min: 0 });
    expect(schema.uses.fields.max.options).toMatchObject({ integer: true, min: 0 });
  });

  it("defaults use forms to an empty required array and delegates validation to the core", () => {
    const schema = EquipmentDataModel.defineSchema() as unknown as { useForms: MockArrayField };
    expect(schema.useForms.options).toMatchObject({ required: true, nullable: false, initial: [] });
    const fields = schema.useForms.element.fields;
    expect(Object.keys(fields)).toEqual(["id", "name", "description", "consumesUse"]);
    expect(fields.id.options).toMatchObject({ required: true, nullable: false, blank: false });
    expect(fields.name.options).toMatchObject({ required: true, nullable: false, blank: false });
    expect(fields.description.options).toMatchObject({ blank: true, initial: "" });
    expect(fields.consumesUse.options).toMatchObject({ required: true, nullable: false, initial: false });
    const validate = schema.useForms.options.validate as (value: unknown) => boolean;
    const use = { id: "measure", name: "Medir", description: "", consumesUse: false };
    expect(validate([])).toBe(true);
    expect(validate([use])).toBe(true);
    expect(validate([use, use])).toBe(false);
    expect(validate([{ ...use, name: " " }])).toBe(false);
    expect(validate([{ ...use, consumesUse: "false" }])).toBe(false);
    expect(validate(null)).toBe(false);
    const source = { category: "tool", description: "", uses: { value: 3, max: 3 }, useForms: [use] };
    expect(() => EquipmentDataModel.validateJoint(source)).not.toThrow();
    expect(source.uses).toEqual({ value: 3, max: 3 });
    expect(() => EquipmentDataModel.validateJoint({ ...source, useForms: [use, use] })).toThrow();
  });
});
