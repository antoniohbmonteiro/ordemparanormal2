import {
  createFoundryTileInteractionCanvasSession,
  tileInteractionPointerSurface,
  type TileInteractionCanvas,
  type TileInteractionCanvasSession,
} from "../adapters/foundry/tile-interactions/tile-interaction-canvas";

export function registerTileInteractions(): void {
  let session: TileInteractionCanvasSession | null = null;
  const stop = () => {
    session?.destroy();
    session = null;
  };
  const start = () => {
    stop();
    const current = (globalThis as typeof globalThis & {
      canvas?: TileInteractionCanvas & { readonly ready: boolean };
    }).canvas;
    if (!current?.ready || !current.app
      || !tileInteractionPointerSurface(current.app)) return;
    session = createFoundryTileInteractionCanvasSession(current);
  };

  Hooks.on("canvasReady", start);
  Hooks.on("canvasTearDown", stop);
  Hooks.on("canvasInit", stop);
}
