export const POI_CONTROL_NAME = "ordemparanormal2-poi";
export const SELECT_POI_TOOL = "selectPoi";

export interface PoiControlState {
  readonly control?: { readonly name: string } | null;
  readonly tool?: { readonly name: string } | null;
}

export function isPoiHoverActive(controls: PoiControlState): boolean {
  return controls.control?.name === POI_CONTROL_NAME && controls.tool?.name === SELECT_POI_TOOL;
}
