import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type FieldOptions = {
  readonly blank?: boolean;
  readonly integer?: boolean;
  readonly initial?: unknown;
  readonly max?: number;
  readonly min?: number;
  readonly nullable?: boolean;
  readonly required?: boolean;
  readonly validate?: (value: unknown) => boolean;
};

class MockField {
  constructor(readonly options: FieldOptions = {}) {}
}

class MockSchemaField {
  constructor(readonly fields: Record<string, MockField | MockSchemaField>) {}
}

class MockTypeDataModel {}

const RESOURCE_KEYS = ["health", "determination"] as const;

let AgentDataModel: typeof import("./agent-data-model").AgentDataModel;

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: MockTypeDataModel },
    data: {
      fields: {
        NumberField: MockField,
        SchemaField: MockSchemaField,
        StringField: MockField,
      },
    },
  });

  ({ AgentDataModel } = await import("./agent-data-model"));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function getResourceFields(
  resourceKey: (typeof RESOURCE_KEYS)[number],
): Record<"value" | "max", MockField> {
  const agentFields = AgentDataModel.defineSchema() as unknown as Record<
    string,
    MockField | MockSchemaField
  >;
  const resources = agentFields.resources as MockSchemaField;
  const resource = resources.fields[resourceKey] as MockSchemaField;

  return resource.fields as Record<"value" | "max", MockField>;
}

describe("AgentDataModel resources", () => {
  it.each(RESOURCE_KEYS)(
    "configures %s fields as non-negative integers without an upper bound",
    (resourceKey) => {
      const fields = getResourceFields(resourceKey);

      for (const field of [fields.value, fields.max]) {
        expect(field.options.integer).toBe(true);
        expect(field.options.min).toBe(0);
        expect(field.options.max).toBeUndefined();
      }
    },
  );

  it("does not define joint resource validation", () => {
    expect(Object.hasOwn(AgentDataModel, "validateJoint")).toBe(false);
  });

  it("does not define legacy Profile or Impetus fields", () => {
    const agentFields = AgentDataModel.defineSchema() as unknown as Record<
      string,
      MockField | MockSchemaField
    >;
    const resources = agentFields.resources as MockSchemaField;

    expect(agentFields).not.toHaveProperty("profile");
    expect(resources.fields).not.toHaveProperty("impetus");
  });

  it("defines an optional canonical appearance accent without a default", () => {
    const agentFields = AgentDataModel.defineSchema() as unknown as Record<
      string,
      MockField | MockSchemaField
    >;
    const appearance = agentFields.appearance as MockSchemaField;
    const accent = appearance.fields.accentColor as MockField;

    expect(accent.options).toMatchObject({
      required: false,
      nullable: false,
      blank: false,
    });
    expect(accent.options.initial).toBeUndefined();
    expect(accent.options.validate?.("#4176BA")).toBe(true);
    expect(accent.options.validate?.("#4176ba")).toBe(false);
  });
});
