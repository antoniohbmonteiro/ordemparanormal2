import { resolvePoiAssociation } from "./poi-catalog";
import type { InvestigationMode } from "./investigation-mode";
import { findPoiHover, listenPoiPointer, orderPoiHover } from "./poi-canvas-hover";
import { readPoiCanvasRegion, type PoiCanvasRegion, type PoiPoint, type PoiRegionView } from "./poi-canvas-regions";
import { createPoiCanvasRenderer, type PoiRenderCanvas, type PoiVisuals } from "./poi-canvas-renderer";

export interface PoiSessionCanvas extends PoiRenderCanvas {
  readonly ready: boolean;
  readonly scene: { readonly id: string; readonly regions: Iterable<PoiCanvasRegion> } | null;
  readonly level: { readonly id: string } | null;
}

export interface PoiSessionEnvironment {
  readonly canvas: PoiSessionCanvas;
  readonly mode: InvestigationMode;
  readonly focus: EventTarget;
  /** The viewer's id; the GM sees every eligible POI, a player only the ones revealed to this id. */
  readonly userId: string;
  isGM(): boolean;
  localize(key: string): string;
}

interface Entry { readonly view: PoiRegionView; name: string }

/** A POI hit under a client point: enough to open its sheet and manage its reveal. */
export interface PoiActionTarget {
  readonly regionId: string;
  readonly itemUuid: string;
  readonly name: string;
}

export interface PoiCanvasSession {
  regionChanged(region: PoiCanvasRegion): void;
  regionDeleted(region: PoiCanvasRegion): void;
  reconcile(): void;
  pan(position: { readonly level?: string | null }): void;
  invalidateItems(matches: (uuid: string) => boolean): void;
  poiActionTargetAt(client: PoiPoint): PoiActionTarget | null;
  destroy(): void;
}

export function createPoiCanvasSession(
  env: PoiSessionEnvironment,
  dependencies: {
    render: (canvas: PoiRenderCanvas) => PoiVisuals;
    resolve: (uuid: string) => Promise<{ readonly name: string } | null>;
  } = { render: createPoiCanvasRenderer, resolve: resolvePoiAssociation },
): PoiCanvasSession | null {
  if (!env.canvas.ready || !env.canvas.scene) return null;
  const scene = env.canvas.scene;
  const renderer = dependencies.render(env.canvas);
  const entries = new Map<string, Entry>();
  const names = new Map<string, Promise<string>>();
  const loading = env.localize("ORDEMPARANORMAL2.PointOfInterest.Canvas.Loading");
  const unavailable = env.localize("ORDEMPARANORMAL2.PointOfInterest.Canvas.Unavailable");
  const unnamed = env.localize("ORDEMPARANORMAL2.PointOfInterest.Canvas.Unnamed");
  let candidates: PoiRegionView[] = [];
  let pointer: PoiPoint | null = null;
  let lastViewedLevelId = env.canvas.level?.id ?? null;
  let disposed = false;
  renderer.setVisible(env.mode.get());
  const active = () => !disposed && env.canvas.ready && env.canvas.scene === scene;
  const viewer = () => ({ isGM: env.isGM(), userId: env.userId });

  function refreshHover(): void {
    const target = active() && env.mode.get() && pointer
      ? findPoiHover(candidates, env.canvas.canvasCoordinatesFromClient(pointer)) : null;
    renderer.hover(target);
    renderer.label(target ? entries.get(target)?.name ?? unavailable : null, pointer);
  }

  function resolveName(entry: Entry): void {
    const uuid = entry.view.itemUuid;
    let request = names.get(uuid);
    if (!request) {
      request = Promise.resolve().then(() => active() && env.isGM() ? dependencies.resolve(uuid) : null)
        .then(item => item?.name ?? unavailable, () => unavailable);
      names.set(uuid, request);
    }
    const expected = request;
    void request.then(name => {
      if (!active() || entries.get(entry.view.id) !== entry || names.get(uuid) !== expected) return;
      entry.name = name;
      refreshHover();
    });
  }

  function upsert(region: PoiCanvasRegion): void {
    const view = readPoiCanvasRegion(region, scene.id, viewer());
    if (!view) {
      if (region.id && entries.delete(region.id)) renderer.remove(region.id);
      return;
    }
    const gm = env.isGM();
    const prior = entries.get(view.id);
    if (prior && prior.view.geometry === view.geometry && prior.view.itemUuid === view.itemUuid) {
      if (prior.view.name === view.name) return;
      // Only the safe-name snapshot changed: swap the entry, leave the geometry node untouched.
      entries.set(view.id, { view, name: gm ? prior.name : view.name ?? unnamed });
      return;
    }
    const entry = {
      view,
      name: prior?.view.itemUuid === view.itemUuid ? prior.name : gm ? loading : view.name ?? unnamed,
    };
    entries.set(view.id, entry);
    renderer.upsert(view.id, view.geometry);
    if (gm) resolveName(entry);
  }

  function refreshCandidates(): void {
    candidates = orderPoiHover([...entries.values()].map(entry => entry.view));
    refreshHover();
  }

  function reconcile(): void {
    if (!active()) return;
    const present = new Set<string>();
    for (const region of scene.regions) { if (region.id) present.add(region.id); upsert(region); }
    for (const id of entries.keys()) {
      if (!present.has(id)) { entries.delete(id); renderer.remove(id); }
    }
    refreshCandidates();
  }

  function invalidateItems(matches: (uuid: string) => boolean): void {
    // Players never resolve Items: their label comes from the association snapshot via upsert().
    if (!active() || !env.isGM()) return;
    for (const uuid of names.keys()) if (matches(uuid)) names.delete(uuid);
    for (const entry of entries.values()) {
      if (!matches(entry.view.itemUuid)) continue;
      entry.name = loading;
      resolveName(entry);
    }
    refreshHover();
  }

  const stopMode = env.mode.subscribe(enabled => {
    if (!active()) return;
    renderer.setVisible(enabled);
    if (enabled) invalidateItems(() => true);
    refreshHover();
  });
  const stopPointer = listenPoiPointer(env.canvas.app.view, env.focus, point => {
    pointer = point; refreshHover();
  });
  reconcile();

  return {
    reconcile,
    regionChanged(region) {
      if (!active() || region.parent?.id !== scene.id || ![...scene.regions].includes(region)) return;
      upsert(region); refreshCandidates();
    },
    regionDeleted(region) {
      if (!active() || region.parent?.id !== scene.id || !region.id) return;
      if (entries.delete(region.id)) renderer.remove(region.id);
      refreshCandidates();
    },
    pan(position) {
      if (!active()) return;
      const level = position.level === undefined ? env.canvas.level?.id ?? null : position.level;
      if (level !== lastViewedLevelId) {
        lastViewedLevelId = level;
        reconcile();
      }
      renderer.camera(); refreshHover();
    },
    invalidateItems,
    poiActionTargetAt(client) {
      if (!active()) return null;
      const id = findPoiHover(candidates, env.canvas.canvasCoordinatesFromClient(client));
      const entry = id ? entries.get(id) : undefined;
      return entry ? { regionId: entry.view.id, itemUuid: entry.view.itemUuid, name: entry.name } : null;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      stopPointer();
      stopMode();
      entries.clear(); names.clear(); candidates = []; pointer = null; lastViewedLevelId = null;
      renderer.destroy();
    },
  };
}
