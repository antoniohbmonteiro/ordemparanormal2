import { EQUIPMENT_CATEGORIES } from "../../core/equipment/equipment-category";

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

type EquipmentUsesSchema = {
  value: RequiredIntegerField;
  max: RequiredIntegerField;
};

type EquipmentSchema = {
  category: RequiredStringField;
  description: RequiredStringField;
  uses: foundry.data.fields.SchemaField<
    EquipmentUsesSchema,
    foundry.data.fields.SourceFromSchema<EquipmentUsesSchema>,
    foundry.data.fields.ModelPropsFromSchema<EquipmentUsesSchema>,
    true,
    true,
    true
  >;
};

function createUsesIntegerField(): RequiredIntegerField {
  return new foundry.data.fields.NumberField({
    required: true,
    nullable: false,
    integer: true,
    min: 0,
    initial: 0,
  });
}

export class EquipmentDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Item,
  EquipmentSchema
> {
  static override defineSchema(): EquipmentSchema {
    return {
      category: new foundry.data.fields.StringField({
        required: true,
        nullable: false,
        blank: false,
        choices: [...EQUIPMENT_CATEGORIES],
        initial: "general",
      }),
      description: new foundry.data.fields.StringField({
        required: true,
        nullable: false,
        blank: true,
        initial: "",
      }),
      uses: new foundry.data.fields.SchemaField(
        {
          value: createUsesIntegerField(),
          max: createUsesIntegerField(),
        },
        { required: true, nullable: true, initial: null },
      ),
    };
  }
}

export interface EquipmentDataModel
  extends foundry.data.fields.ModelPropsFromSchema<EquipmentSchema> {}
