import { SKILL_KEYS, type SkillKey } from "../../config/skills";
import {
  POINT_OF_INTEREST_AVAILABILITY_MODES,
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  isPointOfInterestInformationList,
  type PointOfInterestAvailabilityMode,
} from "./point-of-interest-data";

export type {
  PointOfInterestApproach,
  PointOfInterestInformation,
  PointOfInterestInformationAvailability,
  PointOfInterestSystemData,
} from "./point-of-interest-data";

type RequiredStringField = foundry.data.fields.StringField<string, string, true, false, true>;
type NonBlankStringField = foundry.data.fields.StringField<string, string, true, false, false>;
type SkillKeyField = foundry.data.fields.StringField<SkillKey, SkillKey, true, false, false>;
type RequiredIntegerField = foundry.data.fields.NumberField<number, number, true, false, true>;
type RequiredBooleanField = foundry.data.fields.BooleanField<boolean, boolean, true, false, true>;
type OptionalSpecializationField = foundry.data.fields.StringField<string, string, false, false, false>;

type ApproachSchema = {
  skill: SkillKeyField;
  specialization: OptionalSpecializationField;
  difficulty: RequiredIntegerField;
  showDifficultyToPlayers: RequiredBooleanField;
};
type ApproachArrayField = foundry.data.fields.ArrayField<
  foundry.data.fields.SchemaField<ApproachSchema>,
  foundry.data.fields.SourceFromSchema<ApproachSchema>[],
  foundry.data.fields.ModelPropsFromSchema<ApproachSchema>[],
  true, false, true
>;
type AvailabilitySchema = {
  mode: foundry.data.fields.StringField<
    PointOfInterestAvailabilityMode, PointOfInterestAvailabilityMode, true, false, true
  >;
  condition: RequiredStringField;
};
type InformationSchema = {
  id: NonBlankStringField;
  content: RequiredStringField;
  approaches: ApproachArrayField;
  availability: foundry.data.fields.SchemaField<AvailabilitySchema>;
};
type PointOfInterestSchema = {
  publicDescription: RequiredStringField;
  gmContext: RequiredStringField;
  information: foundry.data.fields.ArrayField<
    foundry.data.fields.SchemaField<InformationSchema>,
    foundry.data.fields.SourceFromSchema<InformationSchema>[],
    foundry.data.fields.ModelPropsFromSchema<InformationSchema>[],
    true, false, true
  >;
};

function richText(): RequiredStringField {
  return new foundry.data.fields.StringField({ required: true, nullable: false, blank: true, initial: "" });
}

export class PointOfInterestDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Item, PointOfInterestSchema
> {
  static override defineSchema(): PointOfInterestSchema {
    return {
      publicDescription: richText(),
      gmContext: richText(),
      information: new foundry.data.fields.ArrayField(
        new foundry.data.fields.SchemaField({
          id: new foundry.data.fields.StringField({ required: true, nullable: false, blank: false }),
          content: richText(),
          approaches: new foundry.data.fields.ArrayField(
            new foundry.data.fields.SchemaField({
              skill: new foundry.data.fields.StringField<SkillKey, SkillKey, true, false, false>({
                required: true, nullable: false, blank: false, choices: [...SKILL_KEYS],
              }),
              specialization: new foundry.data.fields.StringField({ required: false, nullable: false, blank: false }),
              difficulty: new foundry.data.fields.NumberField({
                required: true, nullable: false, integer: true,
                min: POINT_OF_INTEREST_DIFFICULTY_MIN, initial: POINT_OF_INTEREST_DIFFICULTY_MIN,
              }),
              showDifficultyToPlayers: new foundry.data.fields.BooleanField({
                required: true, nullable: false, initial: false,
              }),
            }),
            { required: true, nullable: false, initial: [], min: 1 },
          ),
          // Stored information without availability predates it; cleaning fills "always" without a migration.
          availability: new foundry.data.fields.SchemaField({
            mode: new foundry.data.fields.StringField<
              PointOfInterestAvailabilityMode, PointOfInterestAvailabilityMode, true, false, true
            >({ required: true, nullable: false, blank: false,
              choices: [...POINT_OF_INTEREST_AVAILABILITY_MODES], initial: "always" }),
            condition: new foundry.data.fields.StringField({ required: true, nullable: false, blank: true, initial: "" }),
          }, { required: true, nullable: false }),
        }),
        { required: true, nullable: false, initial: [], validate: isPointOfInterestInformationList },
      ),
    };
  }
}

export interface PointOfInterestDataModel
  extends foundry.data.fields.ModelPropsFromSchema<PointOfInterestSchema> {}
