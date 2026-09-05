import {
  AGENT_ATTRIBUTE_KEYS,
  type AttributeKey,
} from "../../core/actors/agent-attributes";
import { DIE_STEPS, type DieStep } from "../../core/dice/die-step";
import {
  DEFAULT_SKILL_DIE,
  SKILL_DEFINITIONS,
  SKILL_DIE_STEPS,
  type RegisteredSkillDefinition,
  type SkillDieStep,
  type SkillSpecializationDefinition,
} from "../../config/skills";
import {
  isCanonicalAccentColor,
  type AccentColor,
} from "../../core/actors/agent-accent-color";

const RESOURCE_KEYS = ["health", "determination"] as const;

type ResourceKey = (typeof RESOURCE_KEYS)[number];
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
type DieStepField = foundry.data.fields.NumberField<
  DieStep,
  DieStep,
  true,
  false,
  true
>;
type SkillDieStepField = foundry.data.fields.NumberField<
  SkillDieStep,
  SkillDieStep,
  true,
  false,
  true
>;
type OptionalAccentColorField = foundry.data.fields.StringField<
  AccentColor,
  AccentColor,
  false,
  false,
  false
>;

type ResourceSchema = {
  value: RequiredIntegerField;
  max: RequiredIntegerField;
};

type ResourcesSchema = {
  [Key in ResourceKey]: foundry.data.fields.SchemaField<ResourceSchema>;
};

type AttributesSchema = {
  [Key in AttributeKey]: DieStepField;
};

type SpecializationSchema<
  Specializations extends readonly SkillSpecializationDefinition[],
> = {
  [Specialization in Specializations[number] as Specialization["key"]]: SkillDieStepField;
};

type SkillFieldFor<Definition extends RegisteredSkillDefinition> =
  Definition extends {
    readonly specializations: infer Specializations extends readonly SkillSpecializationDefinition[];
  }
    ? foundry.data.fields.SchemaField<SpecializationSchema<Specializations>>
    : SkillDieStepField;

type SkillsSchema = {
  [Definition in RegisteredSkillDefinition as Definition["key"]]: SkillFieldFor<Definition>;
};

type AppearanceSchema = {
  accentColor: OptionalAccentColorField;
};

type AgentSchema = {
  /** Legacy migration input. Active Occupation state is an embedded Item. */
  occupation: RequiredStringField;
  level: RequiredIntegerField;
  appearance: foundry.data.fields.SchemaField<AppearanceSchema>;
  resources: foundry.data.fields.SchemaField<ResourcesSchema>;
  attributes: foundry.data.fields.SchemaField<AttributesSchema>;
  skills: foundry.data.fields.SchemaField<SkillsSchema>;
};

function createResourceValueField(): RequiredIntegerField {
  return new foundry.data.fields.NumberField({
    required: true,
    nullable: false,
    integer: true,
    min: 0,
    initial: 0,
  });
}

function createResourceField(): foundry.data.fields.SchemaField<ResourceSchema> {
  return new foundry.data.fields.SchemaField({
    value: createResourceValueField(),
    max: createResourceValueField(),
  });
}

function createResourcesSchema(): ResourcesSchema {
  return Object.fromEntries(
    RESOURCE_KEYS.map((key) => [key, createResourceField()]),
  ) as ResourcesSchema;
}

function createDieStepField(): DieStepField {
  return new foundry.data.fields.NumberField({
    required: true,
    nullable: false,
    integer: true,
    choices: DIE_STEPS,
    initial: 4,
  });
}

function createAttributesSchema(): AttributesSchema {
  return Object.fromEntries(
    AGENT_ATTRIBUTE_KEYS.map((key) => [key, createDieStepField()]),
  ) as AttributesSchema;
}

function createSkillDieStepField(): SkillDieStepField {
  return new foundry.data.fields.NumberField({
    required: true,
    nullable: false,
    integer: true,
    choices: SKILL_DIE_STEPS,
    initial: DEFAULT_SKILL_DIE,
  });
}

function createSpecializedSkillField<
  const Specializations extends readonly SkillSpecializationDefinition[],
>(
  specializations: Specializations,
): foundry.data.fields.SchemaField<SpecializationSchema<Specializations>> {
  const schema = Object.fromEntries(
    specializations.map(({ key }) => [key, createSkillDieStepField()]),
  ) as SpecializationSchema<Specializations>;

  return new foundry.data.fields.SchemaField(schema);
}

function createSkillsSchema(): SkillsSchema {
  const entries = SKILL_DEFINITIONS.map((definition) => [
    definition.key,
    "specializations" in definition
      ? createSpecializedSkillField(definition.specializations)
      : createSkillDieStepField(),
  ]);

  return Object.fromEntries(entries) as SkillsSchema;
}

export class AgentDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Actor,
  AgentSchema
> {
  static override defineSchema(): AgentSchema {
    return {
      // Keep this field readable until direct upgrades from pre-migration worlds are no longer supported.
      occupation: new foundry.data.fields.StringField({
        required: true,
        nullable: false,
        blank: true,
        initial: "",
      }),
      level: new foundry.data.fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        min: 1,
        max: 10,
        initial: 1,
      }),
      appearance: new foundry.data.fields.SchemaField({
        accentColor: new foundry.data.fields.StringField<
          AccentColor,
          AccentColor,
          false,
          false,
          false
        >({
          required: false,
          nullable: false,
          blank: false,
          validate: isCanonicalAccentColor,
        }),
      }),
      resources: new foundry.data.fields.SchemaField(createResourcesSchema()),
      attributes: new foundry.data.fields.SchemaField(createAttributesSchema()),
      skills: new foundry.data.fields.SchemaField(createSkillsSchema()),
    };
  }
}

export interface AgentDataModel
  extends foundry.data.fields.ModelPropsFromSchema<AgentSchema> {}
