type OccupationSchema = Record<never, never>;

export class OccupationDataModel extends foundry.abstract.TypeDataModel<
  foundry.documents.Item,
  OccupationSchema
> {
  static override defineSchema(): OccupationSchema {
    return {};
  }
}

export interface OccupationDataModel
  extends foundry.data.fields.ModelPropsFromSchema<OccupationSchema> {}
