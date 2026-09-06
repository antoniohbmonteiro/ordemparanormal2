export const POI_CONTROL_NAME = "ordemparanormal2-poi";
export const SELECT_POI_TOOL = "selectPoi";

/**
 * True when a GM currently has the "Investigação" scene control group open with
 * its `selectPoi` tool active. Used to decide whether a canvas right-click may be
 * intercepted for POI actions.
 */
export function isPoiSelectionActive(): boolean {
  const controls = (ui as typeof ui & {
    controls?: { control?: { name: string }; tool?: { name: string } };
  }).controls;
  return !!game.user?.isGM
    && controls?.control?.name === POI_CONTROL_NAME
    && controls?.tool?.name === SELECT_POI_TOOL;
}
