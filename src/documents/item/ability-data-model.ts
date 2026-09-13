import { ABILITY_COST_SOURCES } from "../../core/abilities/ability-cost";
import { readAbilityCost } from "../../core/abilities/ability-cost";
import { readAbilityResource } from "../../core/abilities/ability-resource";
import { readAbilityUses } from "../../core/abilities/ability-use";
import { AGENT_ATTRIBUTE_KEYS } from "../../core/actors/agent-attributes";
import { NORMAL_DIE_STEPS } from "../../core/dice/die-step";
import { SKILL_DEFINITIONS } from "../../config/skills";

type RequiredStringField = foundry.data.fields.StringField<
  string,
  string,
  true,
  false,
  true
>;
type RequiredIntegerField = foundry.data.fields.NumberField<
  number,
  number,
  true,
  false,
  true
>;

type AbilityCostSchema = {
  source: RequiredStringField;
  amount: RequiredIntegerField;
};

type AbilityUseSchema = {
  id: RequiredStringField;
  name: RequiredStringField;
  description: RequiredStringField;
  cost: foundry.data.fields.SchemaField<AbilityCostSchema>;
  minimumLevel: foundry.data.fields.NumberField<
    number,
    number,
    true,
    true,
    true
  >;
  checkIntegration: foundry.data.fields.SchemaField<
    AbilityUseCheckIntegrationSchema,
    foundry.data.fields.SourceFromSchema<AbilityUseCheckIntegrationSchema>,
    foundry.data.fields.ModelPropsFromSchema<AbilityUseCheckIntegrationSchema>,
    true,
    true,
    true
  >;
};

type AbilityUseApplicabilityTypes = {
  any: Record<never, never>;
  attribute: { attribute: RequiredStringField };
  skill: { skill: RequiredStringField };
};

type AbilityUseModificationTypes = {
  extraDie: {
    applicability: foundry.data.fields.TypedSchemaField<AbilityUseApplicabilityTypes>;
    die: RequiredIntegerField;
  };
};

type AbilityUseCheckIntegrationSchema = {
  modification: foundry.data.fields.TypedSchemaField<AbilityUseModificationTypes>;
};

type AbilityResourceSchema = {
  value: RequiredIntegerField;
  max: RequiredIntegerField;
};

type AbilitySchema = {
  description: RequiredStringField;
  resource: foundry.data.fields.SchemaField<
    AbilityResourceSchema,
    foundry.data.fields.SourceFromSchema<AbilityResourceSchema>,
    foundry.data.fields.ModelPropsFromSchema<AbilityResourceSchema>,
    true,
    true,
    true
  >;
  uses: foundry.data.fields.ArrayField<
    foundry.data.fields.SchemaField<AbilityUseSchema>,
    foundry.data.fields.SourceFromSchema<AbilityUseSchema>[],
    foundry.data.fields.ModelPropsFromSchema<AbilityUseSchema>[],
    true,
    false,
    true
  >;
};

function createResourceIntegerField(): RequiredIntegerField {
  return new foundry.data.fields.NumberField({
    required: true,
    nullable: false,
    integer: true,
    min: 0,
    initial: 0,
  });
}

function createCheckIntegrationField(): AbilityUseSchema["checkIntegration"] {
  const applicableSkillKeys = SKILL_DEFINITIONS
    .filter((definition) => !("specializations" in definition))
    .map(({ key }) => key);
  return new foundry.data.fields.SchemaField({
    modification: new foundry.data.fields.TypedSchemaField({
      extraDie: {
        applicability: new foundry.data.fields.TypedSchemaField({
          any: {},
          attribute: {
            attribute: new foundry.data.fields.StringField({
              required: true, nullable: false, blank: false, choices: [...AGENT_ATTRIBUTE_KEYS],
            }),
          },
          skill: {
            skill: new foundry.data.fields.StringField({
              required: true, nullable: false, blank: false, choices: applicableSkillKeys,
            }),
          },
        }),
        die: new foundry.data.fields.NumberField({
          required: true, nullable: false, integer: true, choices: NORMAL_DIE_STEPS,
        }),
      },
    }),
  }, { required: true, nullable: true, initial: null }) as unknown as AbilityUseSchema["checkIntegration"];
}

export class AbilityDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Item,
  AbilitySchema
> {
  static override defineSchema(): AbilitySchema {
    return {
      description: new foundry.data.fields.HTMLField({
        required: true,
        nullable: false,
        blank: true,
        initial: "",
      }),
      resource: new foundry.data.fields.SchemaField(
        {
          value: createResourceIntegerField(),
          max: createResourceIntegerField(),
        },
        { required: true, nullable: true, initial: null },
      ),
      uses: new foundry.data.fields.ArrayField(
        new foundry.data.fields.SchemaField({
          id: new foundry.data.fields.StringField({
            required: true,
            nullable: false,
            blank: false,
          }),
          name: new foundry.data.fields.StringField({
            required: true,
            nullable: false,
            blank: false,
          }),
          description: new foundry.data.fields.HTMLField({
            required: true,
            nullable: false,
            blank: true,
            initial: "",
          }),
          cost: new foundry.data.fields.SchemaField({
            source: new foundry.data.fields.StringField({
              required: true,
              nullable: false,
              blank: false,
              choices: [...ABILITY_COST_SOURCES],
              initial: "none",
            }),
            amount: new foundry.data.fields.NumberField({
              required: true,
              nullable: false,
              integer: true,
              min: 0,
              initial: 0,
            }),
          }),
          minimumLevel: new foundry.data.fields.NumberField({
            required: true,
            nullable: true,
            integer: true,
            min: 1,
            max: 10,
            initial: null,
          }),
          checkIntegration: createCheckIntegrationField(),
        }),
        {
          required: true,
          nullable: false,
          initial: [],
          validate: (value: unknown) => readAbilityUses(value) !== null,
        },
      ),
    };
  }

  static override validateJoint(
    data: foundry.data.fields.SourceFromSchema<AbilitySchema>,
  ): void {
    super.validateJoint(data);
    const uses = readAbilityUses(data.uses);
    if (!uses) throw new Error("Ability uses are invalid.");
    if (
      uses.some(({ cost }) => cost.source === "resource") &&
      !readAbilityResource(data.resource)
    ) {
      throw new Error("Ability resource costs require an owned resource.");
    }
  }

  static override migrateData(source: Record<string, unknown>): Record<string, unknown> {
    if (Object.hasOwn(source, "cost")) {
      if (!Object.hasOwn(source, "uses")) {
        const cost = readAbilityCost(source.cost);
        const resource = readAbilityResource(source.resource);
        const meaningful =
          cost &&
          cost.source !== "none" &&
          cost.amount > 0 &&
          (cost.source !== "resource" || resource !== null);
        source.uses = meaningful
          ? [{
              id: "legacy-use",
              name: "Forma de uso legada",
              description: "",
              cost,
              minimumLevel: null,
              checkIntegration: null,
            }]
          : [];
      }
      delete source.cost;
    }
    if (Array.isArray(source.uses)) {
      source.uses = source.uses.map((use) =>
        use && typeof use === "object" && !Object.hasOwn(use, "checkIntegration")
          ? { ...use, checkIntegration: null }
          : use,
      );
    }
    return super.migrateData(source);
  }
}

export interface AbilityDataModel
  extends foundry.data.fields.ModelPropsFromSchema<AbilitySchema> {}
