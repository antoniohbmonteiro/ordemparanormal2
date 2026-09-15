export interface CanvasClientPoint {
  readonly x: number;
  readonly y: number;
}

interface CanvasToken {
  readonly visible: boolean;
  readonly bounds: { contains(x: number, y: number): boolean };
}

interface BlockingCanvas {
  canvasCoordinatesFromClient(point: CanvasClientPoint): CanvasClientPoint;
  readonly tokens?: { readonly placeables?: readonly CanvasToken[] };
}

/** True when a visible Token owns the native interaction at a client point. */
export function isTokenInteractionAt(client: CanvasClientPoint): boolean {
  const canvas = (globalThis as { canvas?: BlockingCanvas }).canvas;
  const placeables = canvas?.tokens?.placeables;
  if (!canvas || !placeables?.length) return false;
  const point = canvas.canvasCoordinatesFromClient(client);
  return placeables.some(
    token => token.visible && token.bounds.contains(point.x, point.y),
  );
}
