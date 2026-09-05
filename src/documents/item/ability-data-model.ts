import { ABILITY_COST_SOURCES } from "../../core/abilities/ability-cost";

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

type AbilityResourceSchema = {
  value: RequiredIntegerField;
  max: RequiredIntegerField;
};

type AbilitySchema = {
  description: RequiredStringField;
  cost: foundry.data.fields.SchemaField<AbilityCostSchema>;
  resource: foundry.data.fields.SchemaField<
    AbilityResourceSchema,
    foundry.data.fields.SourceFromSchema<AbilityResourceSchema>,
    foundry.data.fields.ModelPropsFromSchema<AbilityResourceSchema>,
    true,
    true,
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

export class AbilityDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Item,
  AbilitySchema
> {
  static override defineSchema(): AbilitySchema {
    return {
      description: new foundry.data.fields.StringField({
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
      resource: new foundry.data.fields.SchemaField(
        {
          value: createResourceIntegerField(),
          max: createResourceIntegerField(),
        },
        { required: true, nullable: true, initial: null },
      ),
    };
  }
}

export interface AbilityDataModel
  extends foundry.data.fields.ModelPropsFromSchema<AbilitySchema> {}
