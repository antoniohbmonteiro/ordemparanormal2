import { addPoiSceneControls } from "../adapters/foundry/points-of-interest/poi-scene-controls";

export function registerPoiSceneControls(): void {
  Hooks.on("getSceneControlButtons", addPoiSceneControls);
}
