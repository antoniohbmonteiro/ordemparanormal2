import { investigationMode } from "./investigation-mode";
import { readPoiRegionAssociation } from "./poi-region-association";

interface LocationRegion {
  readonly viewed: boolean;
  readonly polygonTree: { readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } };
  getFlag(scope: string, key: string): unknown;
}
interface LocationCanvas {
  readonly ready: boolean;
  readonly scene: { readonly id: string; readonly regions: Iterable<LocationRegion> } | null;
  animatePan(view: { x: number; y: number; duration: number }): Promise<unknown>;
}

/** Pan locally to an associated Region; existing Investigation Mode provides its highlight. */
export async function locatePoiInCurrentScene(sceneId: string, itemUuid: string): Promise<boolean> {
  const canvas = (globalThis as typeof globalThis & { canvas?: LocationCanvas }).canvas;
  if (!canvas?.ready || canvas.scene?.id !== sceneId) return false;
  const regions = [...canvas.scene.regions].filter(region => readPoiRegionAssociation(region)?.itemUuid === itemUuid);
  const region = regions.find(candidate => candidate.viewed) ?? regions[0];
  if (!region) return false;
  const { x, y, width, height } = region.polygonTree.bounds;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  investigationMode.set(true);
  await canvas.animatePan({ x: x + width / 2, y: y + height / 2, duration: 250 });
  return true;
}
