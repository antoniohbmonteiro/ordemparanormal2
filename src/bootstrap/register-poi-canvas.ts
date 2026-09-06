import { createPoiCanvasSession, type PoiCanvasSession, type PoiSessionCanvas } from "../adapters/foundry/points-of-interest/poi-canvas-session";
import type { PoiCanvasRegion } from "../adapters/foundry/points-of-interest/poi-canvas-regions";
import type { PoiControlState } from "../adapters/foundry/points-of-interest/poi-control-state";

export function registerPoiCanvas(): void {
  let session: PoiCanvasSession | null = null;
  const stop = () => { session?.destroy(); session = null; };
  const start = () => {
    stop();
    const env = globalThis as typeof globalThis & {
      canvas?: PoiSessionCanvas;
      ui: { controls: EventTarget & PoiControlState };
    };
    if (!game.user?.isGM || !env.canvas?.ready) return;
    session = createPoiCanvasSession({
      canvas: env.canvas, controls: env.ui.controls, focus: window,
      isGM: () => !!game.user?.isGM, localize: key => game.i18n.localize(key),
    });
  };
  Hooks.on("canvasReady", start);
  Hooks.on("canvasTearDown", stop);
  Hooks.on("canvasInit", stop);
  Hooks.on("canvasPan", (_canvas: unknown, position: unknown) => session?.pan(position as { level?: string | null }));
  Hooks.on("createRegion", (region: unknown) => session?.regionChanged(region as PoiCanvasRegion));
  Hooks.on("updateRegion", (region: unknown) => session?.regionChanged(region as PoiCanvasRegion));
  Hooks.on("deleteRegion", (region: unknown) => session?.regionDeleted(region as PoiCanvasRegion));
  Hooks.on("updateScene", () => session?.reconcile());
  for (const hook of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, (item: unknown) => session?.invalidateItems(uuid => uuid === (item as { uuid: string }).uuid));
  }
  Hooks.on("updateCompendium", (pack: unknown) =>
    session?.invalidateItems(uuid => uuid.startsWith(`Compendium.${(pack as { collection: string }).collection}.`)));
  Hooks.on("updateUser", (user: unknown) => {
    if (user !== game.user) return;
    if (!game.user?.isGM) stop();
    else if (!session) start();
  });
}
