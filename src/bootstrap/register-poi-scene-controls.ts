import { addPoiSceneControls } from "../adapters/foundry/points-of-interest/poi-scene-controls";
import { protectPoiDrawingFromConfig, protectPoiDrawingFromControl } from "../adapters/foundry/points-of-interest/poi-region-drawing";

export function registerPoiSceneControls(): void {
  Hooks.on("getSceneControlButtons", addPoiSceneControls);
  Hooks.on("controlRegion", protectPoiDrawingFromControl);
  Hooks.on("renderRegionConfig", protectPoiDrawingFromConfig);
}
