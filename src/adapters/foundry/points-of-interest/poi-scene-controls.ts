import type { SceneControl, SceneControlTool } from "@client/applications/ui/scene-controls.mjs";

const CONTROL_NAME = "ordemparanormal2-poi";
const LOCALIZATION_PREFIX = "ORDEMPARANORMAL2.PointOfInterest.SceneControls";

// Public v14 capabilities are missing from the installed SceneControlTool types.
type PoiSceneControlTool = SceneControlTool & {
  creation: false;
  control: false;
  interaction: false;
};

export function addPoiSceneControls(controls: Record<string, SceneControl>): void {
  const nativeTools = foundry.canvas.layers.RegionLayer.prepareSceneControls().tools;
  const definitions = [
    ["selectPoi", "SelectPoi", nativeTools.select.icon],
    ["createRectangle", "CreateRectangle", nativeTools.rectangle.icon],
    ["createEllipse", "CreateEllipse", nativeTools.ellipse.icon],
    ["createPolygon", "CreatePolygon", nativeTools.polygon.icon],
    ["addArea", "AddArea", "fa-solid fa-plus"],
    ["createHole", "CreateHole", nativeTools.hole.icon],
  ] as const;

  const tools: Record<string, PoiSceneControlTool> = Object.fromEntries(
    definitions.map(([name, label, icon], order) => [name, {
      name,
      order,
      title: game.i18n.localize(`${LOCALIZATION_PREFIX}.${label}`),
      icon,
      button: false,
      toggle: false,
      creation: false,
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

  controls[CONTROL_NAME] = {
    name: CONTROL_NAME,
    title: game.i18n.localize(`${LOCALIZATION_PREFIX}.Title`),
    icon: "op2-poi-control-icon",
    order,
    visible: game.user.isGM,
    activeTool: "selectPoi",
    tools,
  };
}
