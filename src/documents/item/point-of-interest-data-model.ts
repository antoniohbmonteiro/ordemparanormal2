import { SKILL_KEYS, type SkillKey } from "../../config/skills";
import {
  POINT_OF_INTEREST_AVAILABILITY_MODES,
  POINT_OF_INTEREST_DIFFICULTY_MIN,
  isPointOfInterestInformationList,
  uniformToolMechanicConfigurations,
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
type SkillKeyField = foundry.data.fields.StringField<SkillKey, SkillKey, false, false, false>;
type RequiredIntegerField = foundry.data.fields.NumberField<number, number, false, false, false>;
type RequiredBooleanField = foundry.data.fields.BooleanField<boolean, boolean, false, false, false>;
type OptionalSpecializationField = foundry.data.fields.StringField<string, string, false, false, false>;

type DifficultyOverrideSchema = {
  difficulty: foundry.data.fields.NumberField<number, number, true, false, false>;
  condition: NonBlankStringField;
};
type ApproachSchema = {
  type: OptionalSpecializationField;
  equipmentUuid: OptionalSpecializationField;
  useFormId: OptionalSpecializationField;
  mechanicConfig: foundry.data.fields.SchemaField<{
    type: NonBlankStringField;
    sequenceLength: foundry.data.fields.NumberField<number, number, false, false, false>;
    trueFragments: foundry.data.fields.ArrayField<NonBlankStringField, string[], string[], false, false, false>;
    falseFragments: foundry.data.fields.ArrayField<NonBlankStringField, string[], string[], false, false, false>;
  }, { type: string; sequenceLength: number | undefined; trueFragments: string[] | undefined; falseFragments: string[] | undefined }, { type: string; sequenceLength: number | undefined; trueFragments: string[] | undefined; falseFragments: string[] | undefined }, false, false, false>;
  skill: SkillKeyField;
  specialization: OptionalSpecializationField;
  difficulty: RequiredIntegerField;
  showDifficultyToPlayers: RequiredBooleanField;
  difficultyOverride: foundry.data.fields.SchemaField<
    DifficultyOverrideSchema,
    foundry.data.fields.SourceFromSchema<DifficultyOverrideSchema>,
    foundry.data.fields.ModelPropsFromSchema<DifficultyOverrideSchema>,
    false, false, false
  >;
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

class LaboratoryLengthField extends foundry.data.fields.NumberField<number, number, false, false, false> {
  override clean(...args: Parameters<foundry.data.fields.NumberField<number, number, false, false, false>["clean"]>) {
    if (args[0] !== undefined && ![4, 5, 6].includes(args[0] as number)) throw new Error("Laboratory length must be 4, 5 or 6.");
    return super.clean(...args);
  }
}

class ApproachField extends foundry.data.fields.SchemaField<ApproachSchema> {
  override clean(...args: Parameters<foundry.data.fields.SchemaField<ApproachSchema>["clean"]>) {
    const [value, options, state] = args;
    let candidate = value;
    // Preserve legacy skill defaults without injecting skill fields into a tool approach or partial update.
    if (value && typeof value === "object" && !Array.isArray(value) && !options?.partial) {
      const source = value as Record<string, unknown>;
      if (source.type === undefined) candidate = { ...source,
        difficulty: source.difficulty ?? POINT_OF_INTEREST_DIFFICULTY_MIN,
        showDifficultyToPlayers: source.showDifficultyToPlayers ?? true };
    }
    return super.clean(candidate, options, state);
  }
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
            new ApproachField({
              type: new foundry.data.fields.StringField({ required: false, nullable: false, blank: false, choices: ["tool"] }),
              equipmentUuid: new foundry.data.fields.StringField({ required: false, nullable: false, blank: false }),
              useFormId: new foundry.data.fields.StringField({ required: false, nullable: false, blank: false }),
              mechanicConfig: new foundry.data.fields.SchemaField({
                type: new foundry.data.fields.StringField({ required: true, nullable: false, blank: false, choices: ["laboratory", "radio"] }),
                sequenceLength: new LaboratoryLengthField({ required: false, nullable: false, integer: true, initial: undefined }),
                trueFragments: new foundry.data.fields.ArrayField(new foundry.data.fields.StringField({ required: true, nullable: false, blank: false, trim: true }), { required: false, nullable: false, initial: undefined }),
                falseFragments: new foundry.data.fields.ArrayField(new foundry.data.fields.StringField({ required: true, nullable: false, blank: false, trim: true }), { required: false, nullable: false, initial: undefined }),
              }, { required: false, nullable: false }),
              skill: new foundry.data.fields.StringField<SkillKey, SkillKey, false, false, false>({
                required: false, nullable: false, blank: false, choices: [...SKILL_KEYS],
              }),
              specialization: new foundry.data.fields.StringField({ required: false, nullable: false, blank: false }),
              difficulty: new foundry.data.fields.NumberField<number, number, false, false, false>({
                required: false, nullable: false, integer: true,
                min: POINT_OF_INTEREST_DIFFICULTY_MIN, initial: undefined,
              }),
              showDifficultyToPlayers: new foundry.data.fields.BooleanField<boolean, boolean, false, false, false>({
                required: false, nullable: false, initial: undefined,
              }),
              // Optional with no initial value: an approach stored without it keeps exactly its previous source.
              difficultyOverride: new foundry.data.fields.SchemaField({
                difficulty: new foundry.data.fields.NumberField<number, number, true, false, false>({
                  required: true, nullable: false, integer: true, min: POINT_OF_INTEREST_DIFFICULTY_MIN,
                }),
                condition: new foundry.data.fields.StringField({ required: true, nullable: false, blank: false }),
              }, { required: false, nullable: false }),
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
        { required: true, nullable: false, initial: [], validate: (value: unknown) =>
          isPointOfInterestInformationList(value) && uniformToolMechanicConfigurations(value) },
      ),
    };
  }
}

export interface PointOfInterestDataModel
  extends foundry.data.fields.ModelPropsFromSchema<PointOfInterestSchema> {}
