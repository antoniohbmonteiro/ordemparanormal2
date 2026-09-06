import type { PoiPoint } from "./poi-canvas-regions";

interface CanvasToken {
  readonly visible: boolean;
  readonly bounds: { contains(x: number, y: number): boolean };
}

interface BlockingCanvas {
  canvasCoordinatesFromClient(point: PoiPoint): PoiPoint;
  readonly tokens?: { readonly placeables?: readonly CanvasToken[] };
}

/**
 * True when a visible Token sits under the client point — a click there belongs
 * to the Token (control / target / HUD), so the POI beneath it must not open.
 *
 * Uses only public Foundry v14 canvas API: `canvas.canvasCoordinatesFromClient`,
 * `canvas.tokens.placeables`, `token.visible`, `token.bounds`. It never touches
 * the RegionLayer, the POI hit-test, or any protected member.
 */
export function isTokenInteractionAt(client: PoiPoint): boolean {
  const canvas = (globalThis as { canvas?: BlockingCanvas }).canvas;
  const placeables = canvas?.tokens?.placeables;
  if (!canvas || !placeables?.length) return false;
  const point = canvas.canvasCoordinatesFromClient(client);
  return placeables.some(token => token.visible && token.bounds.contains(point.x, point.y));
}
