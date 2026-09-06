import type { Graphics, Polygon } from "pixi.js";
import { readPoiRegionAssociation } from "./poi-region-association";
import { isPoiRevealedTo, readPoiRegionReveal } from "./poi-region-reveal";

export interface PoiPoint { readonly x: number; readonly y: number }

// Read-only public PolygonTree surface missing from the installed Region typings.
export interface PoiGeometry extends Iterable<{ readonly polygon: Polygon | null }> {
  readonly area: number;
  readonly bounds: { contains(x: number, y: number): boolean };
  drawShape(graphics: Graphics): void;
  testPoint(point: PoiPoint): boolean;
}

export interface PoiCanvasRegion {
  readonly id: string | null;
  readonly parent: { readonly id: string } | null;
  readonly viewed: boolean;
  readonly polygonTree: PoiGeometry;
  getFlag(scope: string, key: string): unknown;
}

/** Who is looking at the canvas: the GM sees every eligible POI, a player only revealed ones. */
export interface PoiRegionViewer {
  readonly isGM: boolean;
  readonly userId: string;
}

export interface PoiRegionView {
  readonly id: string;
  readonly itemUuid: string;
  readonly geometry: PoiGeometry;
  /** Safe display-name snapshot from the association flag; absent on legacy associations. */
  readonly name?: string;
}

export function readPoiCanvasRegion(
  region: PoiCanvasRegion,
  sceneId: string,
  viewer: PoiRegionViewer,
): PoiRegionView | null {
  if (!region.id || region.parent?.id !== sceneId || !region.viewed) return null;
  const association = readPoiRegionAssociation(region);
  if (!association) return null;
  if (!viewer.isGM && !isPoiRevealedTo(readPoiRegionReveal(region), viewer.userId, false)) return null;
  const geometry = region.polygonTree;
  if (!(geometry.area > 0)) return null;
  return { id: region.id, itemUuid: association.itemUuid, geometry, name: association.name };
}
