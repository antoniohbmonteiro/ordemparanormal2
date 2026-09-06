// RegionConfig is missing from the installed types; only its public surface is used here.
export interface PoiRegionConfigDocument {
  readonly id: string | null;
  readonly documentName: string;
  readonly parent: { readonly id: string; readonly regions: { get(id: string): unknown } } | null;
  getFlag(scope: string, key: string): unknown;
}

export interface PoiRegionConfigEligibleApp {
  readonly document: PoiRegionConfigDocument;
  readonly isEditable: boolean;
  readonly form: HTMLFormElement | null;
  readonly window: { readonly content: HTMLElement };
}

/**
 * True only for a GM editing a canonical, persisted Region document on a Scene.
 * Excludes players, non-editable sheets, and palette/preview documents.
 */
export function isPoiRegionConfigEligible(app: PoiRegionConfigEligibleApp): boolean {
  const doc = app.document;
  return !!game.user?.isGM && app.isEditable && doc.documentName === "Region"
    && !!doc.id && doc.parent?.regions.get(doc.id) === doc && !!app.form && !!app.window.content;
}
