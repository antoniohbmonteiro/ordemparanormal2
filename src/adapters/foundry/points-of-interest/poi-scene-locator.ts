import { investigationMode } from "./investigation-mode";
import { readPoiCanvasRegion, type PoiCanvasRegion, type PoiGeometry } from "./poi-canvas-regions";
import { readPoiRegionAssociation } from "./poi-region-association";
import { requestPoiScene } from "./poi-runtime-queries";

interface LocationRegion extends PoiCanvasRegion {
  readonly polygonTree: PoiGeometry & { readonly bounds: PoiGeometry["bounds"] & {
    readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  } };
}
interface LocationCanvas {
  readonly ready: boolean;
  readonly scene: { readonly id: string; readonly regions: Iterable<LocationRegion> } | null;
  animatePan(view: { x: number; y: number; duration: number }): Promise<unknown>;
}

function currentCanvas(sceneId: string): LocationCanvas | null {
  const canvas = (globalThis as typeof globalThis & { canvas?: LocationCanvas }).canvas;
  return canvas?.ready && canvas.scene?.id === sceneId ? canvas : null;
}

function validBounds(region: LocationRegion): boolean {
  const { x, y, width, height } = region.polygonTree.bounds;
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
}

function playerLocations(sceneId: string, itemUuid: string, allowed: ReadonlyMap<string, string>): readonly LocationRegion[] {
  const canvas = currentCanvas(sceneId);
  const user = game.user;
  if (!canvas?.scene || !user || user.isGM || !allowed.has(itemUuid)) return [];
  return [...canvas.scene.regions].filter(region => validBounds(region)
    && readPoiCanvasRegion(region, sceneId, { isGM: false, userId: user.id }, allowed)?.itemUuid === itemUuid);
}

export function countPoiVisibleLocations(sceneId: string, itemUuid: string, allowed: ReadonlyMap<string, string>): number {
  return playerLocations(sceneId, itemUuid, allowed).length;
}

/** The panel uses the same eligibility predicate as the current user's canvas representation. */
export function hasPoiVisibleLocation(sceneId: string, itemUuid: string, allowed: ReadonlyMap<string, string>): boolean {
  return countPoiVisibleLocations(sceneId, itemUuid, allowed) > 0;
}

/** Pan locally to an associated Region; existing Investigation Mode provides its highlight. */
export async function locatePoiInCurrentScene(sceneId: string, itemUuid: string): Promise<boolean> {
  let canvas = currentCanvas(sceneId);
  if (!canvas?.scene || !game.user) return false;
  let region: LocationRegion | null;
  if (game.user.isGM) {
    const regions = [...canvas.scene.regions].filter(candidate => readPoiRegionAssociation(candidate)?.itemUuid === itemUuid);
    region = regions.find(candidate => candidate.viewed) ?? regions[0] ?? null;
  } else {
    const result = await requestPoiScene(sceneId);
    if (!("entries" in result)) return false;
    const allowed = new Map(result.entries.map(entry => [entry.itemUuid, entry.name]));
    region = playerLocations(sceneId, itemUuid, allowed)[0] ?? null;
    canvas = currentCanvas(sceneId);
  }
  if (!region || !canvas || !validBounds(region)) return false;
  const { x, y, width, height } = region.polygonTree.bounds;
  investigationMode.set(true);
  await canvas.animatePan({ x: x + width / 2, y: y + height / 2, duration: 250 });
  return true;
}
