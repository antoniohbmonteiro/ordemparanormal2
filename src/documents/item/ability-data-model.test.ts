import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class MockField { constructor(readonly options: Record<string, unknown> = {}) {} }
class MockArrayField {
  constructor(
    readonly element: unknown,
    readonly options: Record<string, unknown> = {},
  ) {}
}
class MockSchemaField {
  constructor(
    readonly fields: Record<string, MockField>,
    readonly options: Record<string, unknown> = {},
  ) {}
}
class MockTypedSchemaField {
  constructor(
    readonly types: Record<string, unknown>,
    readonly options: Record<string, unknown> = {},
  ) {}
}
class MockTypeDataModel {
  static migrateData(source: Record<string, unknown>) { return source; }
  static validateJoint(_data: unknown) {}
}
let AbilityDataModel: typeof import("./ability-data-model").AbilityDataModel;

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: MockTypeDataModel },
    data: { fields: {
      ArrayField: MockArrayField,
      HTMLField: MockField,
      NumberField: MockField,
      SchemaField: MockSchemaField,
      StringField: MockField,
      TypedSchemaField: MockTypedSchemaField,
    } },
  });
  ({ AbilityDataModel } = await import("./ability-data-model"));
});

afterAll(() => vi.unstubAllGlobals());

describe("AbilityDataModel", () => {
  it("defines rich descriptions, ordered uses and one optional resource", () => {
    const schema = AbilityDataModel.defineSchema() as unknown as {
      description: MockField;
      resource: MockSchemaField;
      uses: MockArrayField;
    };
    expect(Object.keys(schema)).toEqual(["description", "resource", "uses"]);
    expect(schema.description.options).toMatchObject({ blank: true, initial: "" });
    const use = schema.uses.element as MockSchemaField;
    const cost = use.fields.cost as unknown as MockSchemaField;
    expect(cost.fields.source.options).toMatchObject({
      choices: ["none", "health", "determination", "resource"],
      initial: "none",
    });
    expect(cost.fields.amount.options).toMatchObject({ integer: true, min: 0 });
    expect(use.fields.minimumLevel.options).toMatchObject({
      integer: true, min: 1, max: 10, nullable: true,
    });
    const integration = use.fields.checkIntegration as unknown as MockSchemaField;
    expect(integration.options).toMatchObject({ nullable: true, initial: null });
    const modification = integration.fields.modification as unknown as MockTypedSchemaField;
    expect(Object.keys(modification.types)).toEqual(["extraDie"]);
    const extraDie = modification.types.extraDie as { applicability: MockTypedSchemaField; die: MockField };
    expect(extraDie.die.options).toMatchObject({ choices: [4, 6, 8, 10, 12] });
    const skill = extraDie.applicability.types.skill as { skill: MockField };
    expect(skill.skill.options.choices).not.toContain("aptitude");
    expect(schema.uses.options).toMatchObject({ required: true, initial: [] });
    expect(schema.resource.options).toMatchObject({
      required: true,
      nullable: true,
      initial: null,
    });
    expect(Object.keys(schema.resource.fields)).toEqual(["value", "max"]);
    expect(schema.resource.fields.value.options).toMatchObject({ integer: true, min: 0 });
    expect(schema.resource.fields.max.options).toMatchObject({ integer: true, min: 0 });
  });

  it("migrates explicit legacy costs without keeping a parallel field", () => {
    const migrated = AbilityDataModel.migrateData({
      description: "",
      cost: { source: "determination", amount: 2 },
      resource: null,
    });
    expect(migrated).not.toHaveProperty("cost");
    expect(migrated.uses).toEqual([
      expect.objectContaining({
        id: "legacy-use",
        cost: { source: "determination", amount: 2 },
        minimumLevel: null,
      }),
    ]);

    expect(AbilityDataModel.migrateData({ uses: [{ id: "old" }] }).uses).toEqual([
      { id: "old", checkIntegration: null },
    ]);

    const authoritative = AbilityDataModel.migrateData({
      cost: { source: "determination", amount: 2 },
      uses: [],
    });
    expect(authoritative).toEqual({ uses: [] });
  });

  it("jointly rejects duplicate ids and resource costs without a resource", () => {
    const use = {
      id: "use", name: "Uso", description: "",
      cost: { source: "none", amount: 0 }, minimumLevel: null, checkIntegration: null,
    };
    expect(() => AbilityDataModel.validateJoint({
      description: "", resource: null, uses: [use, use],
    })).toThrow("Ability uses are invalid");
    expect(() => AbilityDataModel.validateJoint({
      description: "", resource: null,
      uses: [{ ...use, cost: { source: "resource", amount: 1 } }],
    })).toThrow("require an owned resource");
    expect(() => AbilityDataModel.validateJoint({
      description: "", resource: null,
      uses: [{ ...use, cost: { source: "health", amount: 1 } }],
    })).not.toThrow();
  });
});
