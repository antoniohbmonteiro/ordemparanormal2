import { SKILL_KEYS, type SkillKey } from "../../config/skills";
import { POINT_OF_INTEREST_DIFFICULTY_MIN } from "./point-of-interest-data";

export type {
  PointOfInterestInformation,
  PointOfInterestSkill,
  PointOfInterestSystemData,
} from "./point-of-interest-data";

type RequiredStringField = foundry.data.fields.StringField<
  string,
  string,
  true,
  false,
  true
>;
type NonBlankStringField = foundry.data.fields.StringField<
  string,
  string,
  true,
  false,
  false
>;
type SkillKeyField = foundry.data.fields.StringField<
  SkillKey,
  SkillKey,
  true,
  false,
  false
>;
type RequiredIntegerField = foundry.data.fields.NumberField<
  number,
  number,
  true,
  false,
  true
>;
type RequiredBooleanField = foundry.data.fields.BooleanField<
  boolean,
  boolean,
  true,
  false,
  true
>;

type PointOfInterestInformationSchema = {
  id: NonBlankStringField;
  difficulty: RequiredIntegerField;
  content: RequiredStringField;
  showDifficultyToPlayers: RequiredBooleanField;
};

type PointOfInterestInformationArrayField = foundry.data.fields.ArrayField<
  foundry.data.fields.SchemaField<PointOfInterestInformationSchema>,
  foundry.data.fields.SourceFromSchema<PointOfInterestInformationSchema>[],
  foundry.data.fields.ModelPropsFromSchema<PointOfInterestInformationSchema>[],
  true,
  false,
  true
>;

type PointOfInterestSkillSchema = {
  skill: SkillKeyField;
  information: PointOfInterestInformationArrayField;
};

type PointOfInterestSchema = {
  publicDescription: RequiredStringField;
  gmContext: RequiredStringField;
  skills: foundry.data.fields.ArrayField<
    foundry.data.fields.SchemaField<PointOfInterestSkillSchema>,
    foundry.data.fields.SourceFromSchema<PointOfInterestSkillSchema>[],
    foundry.data.fields.ModelPropsFromSchema<PointOfInterestSkillSchema>[],
    true,
    false,
    true
  >;
};

function createRichTextField(): RequiredStringField {
  return new foundry.data.fields.StringField({
    required: true,
    nullable: false,
    blank: true,
    initial: "",
  });
}

/** Reject duplicate skills, empty groups, and information ids repeated anywhere. */
function hasValidSkillGroups(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  const groups = value as Array<{
    skill?: unknown;
    information?: Array<{ id?: unknown }>;
  } | null>;
  const skills = groups.map((group) => group?.skill);
  const ids = groups.flatMap((group) =>
    Array.isArray(group?.information)
      ? group.information.map((entry) => entry?.id)
      : [],
  );
  return (
    groups.every((group) => Array.isArray(group?.information) && group.information.length > 0) &&
    new Set(skills).size === skills.length &&
    new Set(ids).size === ids.length
  );
}

export class PointOfInterestDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Item,
  PointOfInterestSchema
> {
  static override defineSchema(): PointOfInterestSchema {
    return {
      publicDescription: createRichTextField(),
      gmContext: createRichTextField(),
      skills: new foundry.data.fields.ArrayField(
        new foundry.data.fields.SchemaField({
          skill: new foundry.data.fields.StringField<
            SkillKey,
            SkillKey,
            true,
            false,
            false
          >({
            required: true,
            nullable: false,
            blank: false,
            choices: [...SKILL_KEYS],
          }),
          information: new foundry.data.fields.ArrayField(
            new foundry.data.fields.SchemaField({
              id: new foundry.data.fields.StringField({
                required: true,
                nullable: false,
                blank: false,
              }),
              difficulty: new foundry.data.fields.NumberField({
                required: true,
                nullable: false,
                integer: true,
                min: POINT_OF_INTEREST_DIFFICULTY_MIN,
                initial: POINT_OF_INTEREST_DIFFICULTY_MIN,
              }),
              content: createRichTextField(),
              showDifficultyToPlayers: new foundry.data.fields.BooleanField({
                required: true,
                nullable: false,
                initial: false,
              }),
            }),
            { required: true, nullable: false, initial: [], min: 1 },
          ),
        }),
        {
          required: true,
          nullable: false,
          initial: [],
          validate: hasValidSkillGroups,
        },
      ),
    };
  }
}

export interface PointOfInterestDataModel
  extends foundry.data.fields.ModelPropsFromSchema<PointOfInterestSchema> {}
