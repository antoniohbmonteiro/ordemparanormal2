import { SKILL_KEYS, type SkillKey } from "../../config/skills";
import {
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  isPointOfInterestInformationList,
} from "./point-of-interest-data";

export type {
  PointOfInterestApproach,
  PointOfInterestInformation,
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
type InformationSchema = {
  id: NonBlankStringField;
  content: RequiredStringField;
  approaches: ApproachArrayField;
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
  /** Temporary migration input, never emitted by new authoring paths. */
  skills: foundry.data.fields.AnyField;
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
        }),
        { required: true, nullable: false, initial: [], validate: isPointOfInterestInformationList },
      ),
      // AnyField avoids normalizing malformed legacy data before the global pre-flight can report it.
      skills: new foundry.data.fields.AnyField({ required: false, nullable: true }),
    };
  }
}

export interface PointOfInterestDataModel
  extends foundry.data.fields.ModelPropsFromSchema<PointOfInterestSchema> {}
