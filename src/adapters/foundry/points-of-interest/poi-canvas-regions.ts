import type { Graphics, Polygon } from "pixi.js";
import { readPoiRegionAssociation } from "./poi-region-association";

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

export interface PoiRegionView {
  readonly id: string;
  readonly itemUuid: string;
  readonly geometry: PoiGeometry;
}

export function readPoiCanvasRegion(region: PoiCanvasRegion, sceneId: string): PoiRegionView | null {
  if (!region.id || region.parent?.id !== sceneId || !region.viewed) return null;
  const association = readPoiRegionAssociation(region);
  if (!association) return null;
  const geometry = region.polygonTree;
  if (!(geometry.area > 0)) return null;
  return { id: region.id, itemUuid: association.itemUuid, geometry };
}
