import type { SceneControl, SceneControlTool } from "@client/applications/ui/scene-controls.mjs";
import { onPoiToolChange } from "./poi-region-drawing";
import { POI_CONTROL_NAME } from "./poi-control-state";
import { investigationMode } from "./investigation-mode";

const CONTROL_NAME = POI_CONTROL_NAME;
const LOCALIZATION_PREFIX = "ORDEMPARANORMAL2.PointOfInterest.SceneControls";

// Public v14 capabilities are missing from the installed SceneControlTool types.
type PoiSceneControlTool = SceneControlTool & {
  creation: boolean;
  control: false;
  interaction: false;
  shapeData?: object;
};
type PoiSceneControl = SceneControl & { layer?: string };

function onInvestigationModeChange(_event?: Event, active = false): void {
  investigationMode.set(active);
}

export function syncInvestigationModeControl(): void {
  const controls = (ui as typeof ui & { controls?: {
    controls: Record<string, SceneControl>; render(): unknown;
  } }).controls;
  const tool = controls?.controls?.[CONTROL_NAME]?.tools.investigationMode;
  if (!tool || tool.active === investigationMode.get()) return;
  tool.active = investigationMode.get();
  void controls.render();
}

export function addPoiSceneControls(controls: Record<string, SceneControl>): void {
  const native = game.user.isGM
    ? foundry.canvas.layers.RegionLayer.prepareSceneControls() as PoiSceneControl : undefined;
  const nativeTools = native?.tools as Record<string, SceneControlTool & { shapeData?: object }> | undefined;
  const definitions = nativeTools ? [
    ["selectPoi", "SelectPoi", nativeTools.select.icon, undefined],
    ["createRectangle", "CreateRectangle", nativeTools.rectangle.icon, nativeTools.rectangle.shapeData],
    ["createEllipse", "CreateEllipse", nativeTools.ellipse.icon, nativeTools.ellipse.shapeData],
    ["createPolygon", "CreatePolygon", nativeTools.polygon.icon, nativeTools.polygon.shapeData],
    ["addArea", "AddArea", "fa-solid fa-plus", undefined],
    ["createHole", "CreateHole", nativeTools.hole.icon, undefined],
  ] as const : [];

  const tools: Record<string, PoiSceneControlTool> = Object.fromEntries(
    definitions.map(([name, label, icon, shapeData], order) => [name, {
      name,
      order: order + 1,
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
  const mode: PoiSceneControlTool = {
    name: "investigationMode", order: 0,
    title: game.i18n.localize(`${LOCALIZATION_PREFIX}.InvestigationMode`),
    icon: "fa-solid fa-eye", toggle: true, button: false,
    active: investigationMode.get(), creation: false, control: false, interaction: false,
    onChange: onInvestigationModeChange,
  };

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
    visible: true,
    // An empty default lets Foundry choose null when only toggles are available.
    activeTool: native ? "selectPoi" : "",
    ...(native ? { layer: native.layer, onToolChange: onPoiToolChange } : {}),
    tools: { investigationMode: mode, ...tools },
  };
  controls[CONTROL_NAME] = control;
}
