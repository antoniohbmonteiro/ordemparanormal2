import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class MockField { constructor(readonly options: Record<string, unknown> = {}) {} }
class MockSchemaField {
  constructor(
    readonly fields: Record<string, MockField>,
    readonly options: Record<string, unknown> = {},
  ) {}
}
class MockTypeDataModel {}
let AbilityDataModel: typeof import("./ability-data-model").AbilityDataModel;

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: MockTypeDataModel },
    data: { fields: {
      NumberField: MockField,
      SchemaField: MockSchemaField,
      StringField: MockField,
    } },
  });
  ({ AbilityDataModel } = await import("./ability-data-model"));
});

afterAll(() => vi.unstubAllGlobals());

describe("AbilityDataModel", () => {
  it("defines description, structured cost and one optional resource", () => {
    const schema = AbilityDataModel.defineSchema() as unknown as {
      description: MockField;
      cost: MockSchemaField;
      resource: MockSchemaField;
    };
    expect(Object.keys(schema)).toEqual(["description", "cost", "resource"]);
    expect(schema.description.options).toMatchObject({ blank: true, initial: "" });
    expect(schema.cost.fields.source.options).toMatchObject({
      choices: ["none", "determination", "resource"],
      initial: "none",
    });
    expect(schema.cost.fields.amount.options).toMatchObject({ integer: true, min: 0 });
    expect(schema.resource.options).toMatchObject({
      required: true,
      nullable: true,
      initial: null,
    });
    expect(Object.keys(schema.resource.fields)).toEqual(["value", "max"]);
    expect(schema.resource.fields.value.options).toMatchObject({ integer: true, min: 0 });
    expect(schema.resource.fields.max.options).toMatchObject({ integer: true, min: 0 });
  });
});
