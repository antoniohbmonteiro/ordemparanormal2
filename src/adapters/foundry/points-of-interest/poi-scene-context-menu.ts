import type { PoiPoint } from "./poi-canvas-regions";
import type { PoiActionTarget } from "./poi-canvas-session";

export interface PoiSceneContextMenuEnvironment {
  /** The canvas DOM element that receives `contextmenu` events. */
  readonly view: EventTarget;
  /** GM + "Investigação" group + `selectPoi` tool. */
  isActionable(): boolean;
  /** Existing POI/PolygonTree hit-test for a client point (nearest-first priority). */
  targetAt(client: PoiPoint): PoiActionTarget | null;
  /** Opens the small POI actions UI anchored at the pointer. */
  open(target: PoiActionTarget, position: PoiPoint): void;
}

/**
 * Intercepts a canvas right-click only when a GM using `selectPoi` right-clicks
 * inside an associated POI. Every other case (wrong tool, empty space, players,
 * Tokens layer) falls through untouched to Foundry's native handling.
 *
 * The listener runs in the capture phase so the browser context menu and any
 * bubble-phase Foundry handler are suppressed before they act — but only once a
 * POI has actually been hit.
 */
export function listenPoiSceneContextMenu(env: PoiSceneContextMenuEnvironment): () => void {
  const handler = (event: Event) => {
    if (!env.isActionable()) return;
    const pointer = event as MouseEvent & {
      stopImmediatePropagation?: () => void;
    };
    const position: PoiPoint = { x: pointer.clientX, y: pointer.clientY };
    const target = env.targetAt(position);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    pointer.stopImmediatePropagation?.();
    env.open(target, position);
  };
  const controller = new AbortController();
  env.view.addEventListener("contextmenu", handler, { capture: true, signal: controller.signal });
  return () => controller.abort();
}
