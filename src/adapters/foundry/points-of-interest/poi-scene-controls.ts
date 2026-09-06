import type { SceneControl, SceneControlTool } from "@client/applications/ui/scene-controls.mjs";
import { onPoiToolChange, POI_CONTROL_NAME } from "./poi-region-drawing";

const CONTROL_NAME = POI_CONTROL_NAME;
const LOCALIZATION_PREFIX = "ORDEMPARANORMAL2.PointOfInterest.SceneControls";

// Public v14 capabilities are missing from the installed SceneControlTool types.
type PoiSceneControlTool = SceneControlTool & {
  creation: boolean;
  control: false;
  interaction: false;
  shapeData?: object;
};
type PoiSceneControl = SceneControl & { layer: string };

export function addPoiSceneControls(controls: Record<string, SceneControl>): void {
  const native = foundry.canvas.layers.RegionLayer.prepareSceneControls() as PoiSceneControl;
  const nativeTools = native.tools as typeof native.tools & Record<string, { shapeData?: object }>;
  const definitions = [
    ["selectPoi", "SelectPoi", nativeTools.select.icon, undefined],
    ["createRectangle", "CreateRectangle", nativeTools.rectangle.icon, nativeTools.rectangle.shapeData],
    ["createEllipse", "CreateEllipse", nativeTools.ellipse.icon, nativeTools.ellipse.shapeData],
    ["createPolygon", "CreatePolygon", nativeTools.polygon.icon, nativeTools.polygon.shapeData],
    ["addArea", "AddArea", "fa-solid fa-plus", undefined],
    ["createHole", "CreateHole", nativeTools.hole.icon, undefined],
  ] as const;

  const tools: Record<string, PoiSceneControlTool> = Object.fromEntries(
    definitions.map(([name, label, icon, shapeData], order) => [name, {
      name,
      order,
      title: game.i18n.localize(`${LOCALIZATION_PREFIX}.${label}`),
      icon,
      button: false,
      toggle: false,
      creation: !!shapeData,
      ...(shapeData ? { shapeData: foundry.utils.deepClone(shapeData) } : {}),
      control: false,
      interaction: false,
    } satisfies PoiSceneControlTool]),
  );

  const order = Object.entries(controls).reduce(
    (nextOrder, [name, control]) => name === CONTROL_NAME
      ? nextOrder
      : Math.max(nextOrder, control.order + 1),
    0,
  );

  const control: PoiSceneControl = {
    name: CONTROL_NAME,
    title: game.i18n.localize(`${LOCALIZATION_PREFIX}.Title`),
    icon: "op2-poi-control-icon",
    order,
    visible: game.user.isGM,
    activeTool: "selectPoi",
    layer: native.layer,
    onToolChange: onPoiToolChange,
    tools,
  };
  controls[CONTROL_NAME] = control;
}
