import type { DocumentUUID } from "@client/utils/helpers.mjs";
import {
  isCanonicalAccentColor,
  type AccentColor,
} from "../../core/actors/agent-accent-color";
export type {
  ProfileAbilityGrantData,
  ProfileSystemData,
} from "./profile-ability-grant-data";

type RequiredDocumentUuidField = foundry.data.fields.DocumentUUIDField<
  DocumentUUID,
  true,
  false,
  false
>;

type ProfileAbilityGrantSchema = {
  uuid: RequiredDocumentUuidField;
};

type ProfileSchema = {
  accentColor: foundry.data.fields.StringField<
    AccentColor,
    AccentColor,
    false,
    false,
    false
  >;
  abilityGrants: foundry.data.fields.ArrayField<
    foundry.data.fields.SchemaField<ProfileAbilityGrantSchema>,
    foundry.data.fields.SourceFromSchema<ProfileAbilityGrantSchema>[],
    foundry.data.fields.ModelPropsFromSchema<ProfileAbilityGrantSchema>[],
    true,
    false,
    true
  >;
};

export class ProfileDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Item,
  ProfileSchema
> {
  static override defineSchema(): ProfileSchema {
    return {
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
      abilityGrants: new foundry.data.fields.ArrayField(
        new foundry.data.fields.SchemaField({
          uuid: new foundry.data.fields.DocumentUUIDField({
            required: true,
            nullable: false,
            type: "Item",
            embedded: false,
          }),
        }),
        {
          required: true,
          nullable: false,
          initial: [],
        },
      ),
    };
  }
}

export interface ProfileDataModel
  extends foundry.data.fields.ModelPropsFromSchema<ProfileSchema> {}
