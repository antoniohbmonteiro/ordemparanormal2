import { createPoiCanvasSession, type PoiCanvasSession, type PoiSessionCanvas } from "../adapters/foundry/points-of-interest/poi-canvas-session";
import type { PoiCanvasRegion } from "../adapters/foundry/points-of-interest/poi-canvas-regions";
import { investigationMode } from "../adapters/foundry/points-of-interest/investigation-mode";
import { isPoiSelectionActive } from "../adapters/foundry/points-of-interest/poi-control-state";
import { listenPoiSceneContextMenu } from "../adapters/foundry/points-of-interest/poi-scene-context-menu";
import { openPoiActionsMenu } from "../adapters/foundry/points-of-interest/poi-actions-menu";
import { listenPoiSceneClick } from "../adapters/foundry/points-of-interest/poi-scene-click";
import { isTokenInteractionAt } from "../adapters/foundry/points-of-interest/poi-token-blocking";
import { openInvestigationApplication } from "../applications/points-of-interest/investigation-application";

export function registerPoiCanvas(): void {
  let session: PoiCanvasSession | null = null;
  let stopContextMenu: (() => void) | null = null;
  let stopClick: (() => void) | null = null;
  let startedAsGM = false;
  const stop = () => {
    stopContextMenu?.(); stopContextMenu = null;
    stopClick?.(); stopClick = null;
    session?.destroy(); session = null;
  };
  const start = () => {
    stop();
    const env = globalThis as typeof globalThis & {
      canvas?: PoiSessionCanvas;
    };
    if (!env.canvas?.ready) return;
    startedAsGM = !!game.user?.isGM;
    session = createPoiCanvasSession({
      canvas: env.canvas, mode: investigationMode, focus: window,
      userId: game.user?.id ?? "",
      isGM: () => !!game.user?.isGM, localize: key => game.i18n.localize(key),
    });
    const view = (env.canvas.app as unknown as { view?: EventTarget } | undefined)?.view;
    if (session && view) {
      const canvasSession = session;
      // Left-click a POI (both roles) → open the Investigation Application.
      stopClick = listenPoiSceneClick({
        view,
        isModeOn: () => investigationMode.get(),
        targetAt: point => canvasSession.poiActionTargetAt(point),
        isBlockedAt: isTokenInteractionAt,
        open: target => openInvestigationApplication({
          sceneId: env.canvas?.scene?.id ?? "",
          regionId: target.regionId,
          name: target.name,
        }),
      });
      // Reveal management from the canvas is GM-only; players have no selectPoi tool.
      if (game.user?.isGM) {
        stopContextMenu = listenPoiSceneContextMenu({
          view,
          isActionable: isPoiSelectionActive,
          targetAt: point => canvasSession.poiActionTargetAt(point),
          open: (target, position) => openPoiActionsMenu(target, position),
        });
      }
    }
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
    // Rebuild only when the viewer's role actually flips (GM sees all, player sees revealed).
    if (!session || !!game.user?.isGM !== startedAsGM) start();
  });
}
