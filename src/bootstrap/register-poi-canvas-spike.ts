import type Canvas from "@client/canvas/board.mjs";
import { addPoiSpikeSceneControls } from "../adapters/foundry/poi-canvas-spike/scene-controls";
import { PoiSpikeRenderer, type PoiSpikeRegion } from "../adapters/foundry/poi-canvas-spike/renderer";

export function registerPoiCanvasSpike(): () => void {
  let renderer: PoiSpikeRenderer | null = null;
  const tearDown = () => {
    renderer?.destroy();
    renderer = null;
  };
  const ready = (board: Canvas) => {
    tearDown();
    // This experiment has no player projection or visibility policy yet.
    if (!game.user.isGM || !board.scene) return;
    renderer = new PoiSpikeRenderer(board);
    for (const region of board.scene.regions) renderer.upsert(region);
  };
  const hooks: [string, number][] = [
    ["getSceneControlButtons", Hooks.on("getSceneControlButtons", addPoiSpikeSceneControls)],
    ["canvasReady", Hooks.on("canvasReady", ready)],
    ["canvasTearDown", Hooks.on("canvasTearDown", tearDown)],
    ["canvasPan", Hooks.on("canvasPan", () => renderer?.onPan())],
    // The installed typings omit the Region document hook overloads.
    ["createRegion", Hooks.on("createRegion", (region) => renderer?.upsert(region as PoiSpikeRegion))],
    ["updateRegion", Hooks.on("updateRegion", (region) => renderer?.upsert(region as PoiSpikeRegion))],
    ["deleteRegion", Hooks.on("deleteRegion", (region) => renderer?.remove(region as PoiSpikeRegion))],
  ];
  return () => {
    tearDown();
    for (const [name, id] of hooks) Hooks.off(name, id);
  };
}
