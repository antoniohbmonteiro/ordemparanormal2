import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class MockField { constructor(readonly options: Record<string, unknown> = {}) {} }
class MockSchemaField {
  constructor(
    readonly fields: Record<string, MockField>,
    readonly options: Record<string, unknown> = {},
  ) {}
}
class MockTypeDataModel {}
let EquipmentDataModel: typeof import("./equipment-data-model").EquipmentDataModel;

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: MockTypeDataModel },
    data: { fields: {
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
    expect(Object.keys(schema)).toEqual(["category", "description", "uses"]);
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
});
