import { SKILL_KEYS, type SkillKey } from "../../config/skills";
import { POINT_OF_INTEREST_DIFFICULTY_MIN } from "./point-of-interest-data";

export type {
  PointOfInterestInformation,
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
  skill: SkillKeyField;
  difficulty: RequiredIntegerField;
  content: RequiredStringField;
};

type PointOfInterestSchema = {
  publicDescription: RequiredStringField;
  gmContext: RequiredStringField;
  showDifficultiesToPlayers: RequiredBooleanField;
  information: foundry.data.fields.ArrayField<
    foundry.data.fields.SchemaField<PointOfInterestInformationSchema>,
    foundry.data.fields.SourceFromSchema<PointOfInterestInformationSchema>[],
    foundry.data.fields.ModelPropsFromSchema<PointOfInterestInformationSchema>[],
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

/** Reject an information list that repeats an id. */
function hasUniqueInformationIds(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  const ids = value.map((entry) => (entry as { id?: unknown } | null)?.id);
  return new Set(ids).size === ids.length;
}

export class PointOfInterestDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Item,
  PointOfInterestSchema
> {
  static override defineSchema(): PointOfInterestSchema {
    return {
      publicDescription: createRichTextField(),
      gmContext: createRichTextField(),
      showDifficultiesToPlayers: new foundry.data.fields.BooleanField({
        required: true,
        nullable: false,
        initial: false,
      }),
      information: new foundry.data.fields.ArrayField(
        new foundry.data.fields.SchemaField({
          id: new foundry.data.fields.StringField({
            required: true,
            nullable: false,
            blank: false,
          }),
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
          difficulty: new foundry.data.fields.NumberField({
            required: true,
            nullable: false,
            integer: true,
            min: POINT_OF_INTEREST_DIFFICULTY_MIN,
            initial: POINT_OF_INTEREST_DIFFICULTY_MIN,
          }),
          content: createRichTextField(),
        }),
        {
          required: true,
          nullable: false,
          initial: [],
          validate: hasUniqueInformationIds,
        },
      ),
    };
  }
}

export interface PointOfInterestDataModel
  extends foundry.data.fields.ModelPropsFromSchema<PointOfInterestSchema> {}
