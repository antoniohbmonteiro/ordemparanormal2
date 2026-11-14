import { findActorCheckSkill, parseActorCheckSelection } from "../../application/checks/build-actor-check";
import { SKILL_DIE_STEPS, type SkillDieStep } from "../../config/skills";
import { AGENT_ATTRIBUTE_KEYS, type AttributeKey } from "../../core/actors/agent-attributes";
import { DIE_STEPS, type DieStep } from "../../core/dice/die-step";
import { createCustomSkillsField } from "./custom-skills-field";
import { isCustomSkillKey, readSkillDie } from "../../core/actors/custom-skills";

export const THREAT_DAMAGE_TIMINGS = ["immediate", "perRound"] as const;
export const THREAT_TRAIT_LISTS = ["passiveEffects", "specialAbilities"] as const;
export const THREAT_TRAIT_TEXTS = ["vulnerabilities", "immunities", "fearEnigma"] as const;
const SKILL_KINDS = ["skill", "aptitude"] as const;
const CHECK_KINDS = ["attribute", ...SKILL_KINDS] as const;

function textField() {
  return new foundry.data.fields.StringField<string, string, true, false, true>({
    required: true, nullable: false, blank: true, initial: "",
  });
}

function requiredText() {
  return new foundry.data.fields.StringField<string, string, true, false, false>({
    required: true, nullable: false, blank: false, trim: true,
  });
}

function integerField() {
  return new foundry.data.fields.NumberField<number, number, true, false, true>({
    required: true, nullable: false, integer: true, min: 0, max: Number.MAX_SAFE_INTEGER, initial: 0,
  });
}

function attributeField() {
  return new foundry.data.fields.NumberField<DieStep, DieStep, true, false, true>({
    required: true, nullable: false, choices: DIE_STEPS, integer: true, initial: 4,
  });
}

function choiceField<const Choice extends string>(choices: readonly Choice[]) {
  return new foundry.data.fields.StringField<Choice, Choice, true, false, false>({
    required: true, nullable: false, blank: false, choices,
  });
}

function optionalSchema<S extends foundry.abstract.DataSchema>(fields: S) {
  return new foundry.data.fields.SchemaField<
    S, foundry.data.fields.SourceFromSchema<S>, foundry.data.fields.ModelPropsFromSchema<S>, true, true, true
  >(fields, { required: true, nullable: true, initial: null });
}

function schemaField<S extends foundry.abstract.DataSchema>(fields: S) {
  return new foundry.data.fields.SchemaField<
    S, foundry.data.fields.SourceFromSchema<S>, foundry.data.fields.ModelPropsFromSchema<S>
  >(fields);
}

function entriesField<S extends foundry.abstract.DataSchema>(fields: S) {
  const entry = schemaField(fields);
  return new foundry.data.fields.ArrayField<
    typeof entry, foundry.data.fields.SourceFromSchema<S>[], foundry.data.fields.ModelPropsFromSchema<S>[]
  >(entry);
}

function namedEntry() {
  return {
    id: requiredText(),
    name: requiredText(),
    description: textField(),
  };
}

function createSchema() {
  const { ArrayField, NumberField, StringField } = foundry.data.fields;
  const absent = { required: true, nullable: true, initial: null } as const;
  return {
    category: textField(),
    elements: new ArrayField(requiredText()),
    resources: schemaField({
      health: schemaField({ value: integerField(), max: integerField() }),
    }),
    damageReduction: new NumberField<number, number, true, true, true>({
      ...absent, integer: true, min: 0, max: Number.MAX_SAFE_INTEGER,
    }),
    attributes: schemaField({
      physical: attributeField(), mind: attributeField(), emotion: attributeField(),
    }),
    skills: entriesField({
      kind: choiceField(SKILL_KINDS),
      key: requiredText(),
      die: new NumberField<SkillDieStep, SkillDieStep, true, false, true>({
        required: true, nullable: false, integer: true, choices: SKILL_DIE_STEPS, initial: 4,
      }),
    }),
    customSkills: createCustomSkillsField(),
    actions: entriesField({
      id: requiredText(),
      name: requiredText(),
      typeLabel: textField(),
      requirements: textField(),
      description: textField(),
      check: optionalSchema({
        kind: choiceField(CHECK_KINDS),
        key: requiredText(),
        attribute: new StringField<AttributeKey, AttributeKey, true, true, true>({
          ...absent, choices: AGENT_ATTRIBUTE_KEYS, blank: false,
        }),
      }),
      damage: optionalSchema({
        expression: requiredText(),
        timing: choiceField(THREAT_DAMAGE_TIMINGS),
      }),
    }),
    conditions: entriesField({ id: requiredText(), label: requiredText() }),
    characteristics: schemaField({
      passiveEffects: entriesField(namedEntry()),
      specialAbilities: entriesField(namedEntry()),
      vulnerabilities: textField(),
      immunities: textField(),
      fearEnigma: textField(),
    }),
  };
}

type ThreatSchema = ReturnType<typeof createSchema>;
export type ThreatSource = foundry.data.fields.SourceFromSchema<ThreatSchema>;
export type ThreatAction = ThreatDataModel["actions"][number];
export type ThreatSkill = ThreatDataModel["skills"][number];

export function threatSkillKey({ kind, key }: { kind: string; key: string }): string {
  return `${kind}:${key}`;
}

function assertUnique(keys: readonly (string | undefined)[]): void {
  if (keys.includes(undefined) || new Set(keys).size !== keys.length) {
    throw new Error("Invalid or duplicate threat entries.");
  }
}

export class ThreatDataModel extends foundry.abstract.TypeDataModel<foundry.documents.Actor, ThreatSchema> {
  static override defineSchema(): ThreatSchema {
    return createSchema();
  }

  static override validateJoint(data: ThreatSource): void {
    super.validateJoint(data);
    assertUnique(data.elements.map((value) => value.toLocaleLowerCase("pt-BR")));
    const skillKeys = data.skills.map(({ kind, key }) => {
      const skill = kind && key && findActorCheckSkill(kind, key);
      if (!skill) throw new Error("Unknown threat skill.");
      return threatSkillKey({ kind, key });
    });
    assertUnique(skillKeys);
    for (const entries of [
      data.actions, data.conditions, data.characteristics.passiveEffects, data.characteristics.specialAbilities,
    ]) assertUnique(entries.map(({ id }) => id));

    for (const { check } of data.actions) {
      if (!check) continue;
      const selection = parseActorCheckSelection(check.kind, check.key);
      const possessesSkill = selection?.kind === "skill" && isCustomSkillKey(selection.key)
        ? readSkillDie(data.customSkills?.[selection.key]) !== undefined
        : selection && skillKeys.includes(threatSkillKey(selection));
      if (!selection || (selection.kind === "attribute" && check.attribute != null)
        || (selection.kind !== "attribute" && !possessesSkill)) {
        throw new Error("Invalid threat action check.");
      }
    }
  }
}

export interface ThreatDataModel extends foundry.data.fields.ModelPropsFromSchema<ThreatSchema> {}
