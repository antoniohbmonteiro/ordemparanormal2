import type { PoiPoint } from "./poi-canvas-regions";
import type { PoiActionTarget } from "./poi-canvas-session";

/** Max pointer travel (client px) between down and up that still counts as a click. */
const CLICK_SLOP = 6;

export interface PoiSceneClickEnvironment {
  /** The canvas DOM element that receives pointer events. */
  readonly view: EventTarget;
  /** Investigation Mode is ON. */
  isModeOn(): boolean;
  /** Existing POI/PolygonTree hit-test for a client point (nearest-first priority). */
  targetAt(client: PoiPoint): PoiActionTarget | null;
  /** A Token that should get the native interaction sits under the client point. */
  isBlockedAt(client: PoiPoint): boolean;
  /** Opens the Investigation Application for the hit POI. */
  open(target: PoiActionTarget): void;
}

interface PendingClick {
  readonly x: number;
  readonly y: number;
  readonly target: PoiActionTarget | null;
  readonly blocked: boolean;
}

/**
 * Turns a left-click that lands and releases inside the same POI into an
 * `open()` — purely by observing pointer events. It never calls
 * `preventDefault`/`stopPropagation`, so native Token selection and drag are
 * untouched; a drag (pointer travels past `CLICK_SLOP`) does not open anything,
 * and a Token under the gesture (start or end) keeps priority over the POI.
 */
export function listenPoiSceneClick(env: PoiSceneClickEnvironment): () => void {
  let pending: PendingClick | null = null;

  const down = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.button !== 0) return;
    const point = { x: pointer.clientX, y: pointer.clientY };
    pending = { ...point, target: env.targetAt(point), blocked: env.isBlockedAt(point) };
  };

  const up = (event: Event) => {
    const pointer = event as PointerEvent;
    const start = pending;
    pending = null;
    if (!start || pointer.button !== 0 || start.blocked) return;
    if (Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) > CLICK_SLOP) return;
    if (!env.isModeOn()) return;
    const point = { x: pointer.clientX, y: pointer.clientY };
    if (env.isBlockedAt(point)) return;
    const end = env.targetAt(point);
    if (start.target && end && start.target.regionId === end.regionId) env.open(start.target);
  };

  const cancel = () => { pending = null; };

  const controller = new AbortController();
  const { signal } = controller;
  env.view.addEventListener("pointerdown", down, { signal });
  env.view.addEventListener("pointerup", up, { signal });
  env.view.addEventListener("pointercancel", cancel, { signal });
  env.view.addEventListener("pointerleave", cancel, { signal });
  window.addEventListener("blur", cancel, { signal });
  return () => controller.abort();
}
