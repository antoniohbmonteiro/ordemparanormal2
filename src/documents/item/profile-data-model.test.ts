import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class MockField { constructor(readonly options: Record<string, unknown> = {}) {} }
class MockSchemaField { constructor(readonly fields: Record<string, MockField>) {} }
class MockArrayField {
  constructor(
    readonly element: MockSchemaField,
    readonly options: Record<string, unknown>,
  ) {}
}
class MockTypeDataModel {}
let ProfileDataModel: typeof import("./profile-data-model").ProfileDataModel;

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: MockTypeDataModel },
    data: {
      fields: {
        ArrayField: MockArrayField,
        DocumentUUIDField: MockField,
        SchemaField: MockSchemaField,
        StringField: MockField,
      },
    },
  });
  ({ ProfileDataModel } = await import("./profile-data-model"));
});

afterAll(() => vi.unstubAllGlobals());

describe("ProfileDataModel", () => {
  it("defines non-embedded Item UUID grants with an empty-array default", () => {
    const schema = ProfileDataModel.defineSchema() as unknown as {
      abilityGrants: MockArrayField;
    };

    expect(Object.keys(schema)).toEqual(["accentColor", "abilityGrants"]);
    expect(schema.abilityGrants.options).toMatchObject({
      required: true,
      nullable: false,
      initial: [],
    });
    expect(schema.abilityGrants.element.fields.uuid.options).toMatchObject({
      required: true,
      nullable: false,
      type: "Item",
      embedded: false,
    });
  });

  it("defines an optional canonical accent without materializing a default", () => {
    const schema = ProfileDataModel.defineSchema() as unknown as {
      accentColor: MockField;
    };

    expect(schema.accentColor.options).toMatchObject({
      required: false,
      nullable: false,
      blank: false,
    });
    expect(schema.accentColor.options.initial).toBeUndefined();
    const validate = schema.accentColor.options.validate as (
      value: unknown,
    ) => boolean;
    expect(validate("#AE2C12")).toBe(true);
    expect(validate("#ae2c12")).toBe(false);
  });
});
