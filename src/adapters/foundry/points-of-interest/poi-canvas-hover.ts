import type { PoiPoint, PoiRegionView } from "./poi-canvas-regions";

export function findPoiHover(regions: readonly PoiRegionView[], point: PoiPoint): string | null {
  for (const region of regions) {
    if (region.geometry.bounds.contains(point.x, point.y) && region.geometry.testPoint(point)) return region.id;
  }
  return null;
}

export function orderPoiHover(regions: Iterable<PoiRegionView>): PoiRegionView[] {
  return [...regions].sort((a, b) => a.geometry.area - b.geometry.area || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function listenPoiPointer(
  view: EventTarget, focus: EventTarget, changed: (point: PoiPoint | null) => void,
): () => void {
  const move = (event: Event) => {
    const pointer = event as PointerEvent;
    changed({ x: pointer.clientX, y: pointer.clientY });
  };
  const leave = () => changed(null);
  view.addEventListener("pointermove", move);
  view.addEventListener("pointerleave", leave);
  focus.addEventListener("blur", leave);
  return () => {
    view.removeEventListener("pointermove", move);
    view.removeEventListener("pointerleave", leave);
    focus.removeEventListener("blur", leave);
  };
}
