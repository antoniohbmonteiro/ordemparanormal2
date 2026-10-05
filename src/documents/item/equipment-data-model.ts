import { EQUIPMENT_CATEGORIES } from "../../core/equipment/equipment-category";
import { readEquipmentUseForms } from "../../core/equipment/equipment-use";
import { isEquipmentQuantity } from "../../core/equipment/equipment-quantity";

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

type EquipmentUseSchema = {
  id: RequiredStringField;
  name: RequiredStringField;
  description: RequiredStringField;
  consumesUse: foundry.data.fields.BooleanField<boolean, boolean, true, false, true>;
  mechanic: RequiredStringField;
};

class EquipmentQuantityField extends foundry.data.fields.NumberField<number, number, true, true, true> {
  override clean(...args: Parameters<foundry.data.fields.NumberField<number, number, true, true, true>["clean"]>): number | null {
    const [value] = args;
    // Reject invalid input before NumberField rounds and clamps it.
    if (value !== undefined && value !== null && !isEquipmentQuantity(value)) {
      throw new Error("Equipment quantity must be a nonnegative safe integer or null.");
    }
    return super.clean(...args);
  }
}

type EquipmentSchema = {
  category: RequiredStringField;
  description: RequiredStringField;
  quantity: foundry.data.fields.NumberField<number, number, true, true, true>;
  uses: foundry.data.fields.SchemaField<
    EquipmentUsesSchema,
    foundry.data.fields.SourceFromSchema<EquipmentUsesSchema>,
    foundry.data.fields.ModelPropsFromSchema<EquipmentUsesSchema>,
    true,
    true,
    true
  >;
  useForms: foundry.data.fields.ArrayField<
    foundry.data.fields.SchemaField<EquipmentUseSchema>,
    foundry.data.fields.SourceFromSchema<EquipmentUseSchema>[],
    foundry.data.fields.ModelPropsFromSchema<EquipmentUseSchema>[],
    true,
    false,
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
      quantity: new EquipmentQuantityField({
        required: true, nullable: true, integer: true, initial: null,
        min: 0, max: Number.MAX_SAFE_INTEGER,
        validate: (value: unknown) => value === null || isEquipmentQuantity(value),
      }),
      uses: new foundry.data.fields.SchemaField(
        {
          value: createUsesIntegerField(),
          max: createUsesIntegerField(),
        },
        { required: true, nullable: true, initial: null },
      ),
      useForms: new foundry.data.fields.ArrayField(
        new foundry.data.fields.SchemaField({
          id: new foundry.data.fields.StringField({ required: true, nullable: false, blank: false }),
          name: new foundry.data.fields.StringField({ required: true, nullable: false, blank: false }),
          description: new foundry.data.fields.StringField({
            required: true, nullable: false, blank: true, initial: "",
          }),
          consumesUse: new foundry.data.fields.BooleanField({
            required: true, nullable: false, initial: false,
          }),
          mechanic: new foundry.data.fields.StringField({
            required: true, nullable: false, blank: false, choices: ["standard", "laboratory", "radio"], initial: "standard",
          }),
        }),
        {
          required: true, nullable: false, initial: [],
          validate: (value: unknown) => readEquipmentUseForms(value) !== null,
        },
      ),
    };
  }

  static override validateJoint(data: foundry.data.fields.SourceFromSchema<EquipmentSchema>): void {
    super.validateJoint(data);
    if (readEquipmentUseForms(data.useForms) === null) {
      throw new Error("Equipment use forms are invalid.");
    }
  }
}

export interface EquipmentDataModel
  extends foundry.data.fields.ModelPropsFromSchema<EquipmentSchema> {}
