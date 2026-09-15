import { isTokenInteractionAt, type CanvasClientPoint } from "../canvas/token-interaction-blocking";
import { readTileInteractionConfig } from "./tile-interaction-config";
import {
  toggleTileInteraction,
  type TileInteractionTileDocument,
  type ToggleTileInteractionResult,
} from "../../../features/tile-interactions/toggle-tile-interaction";

const CLICK_SLOP = 6;

interface CanvasTilePlaceable {
  readonly document: TileInteractionTileDocument & {
    readonly sort?: number;
    readonly z?: number;
  };
  readonly isVisible: boolean;
  readonly hasPreview: boolean;
  readonly mesh: {
    readonly zIndex?: number;
    containsCanvasPoint(point: CanvasClientPoint): boolean;
  } | null;
}

export interface TileInteractionCanvas {
  canvasCoordinatesFromClient(point: CanvasClientPoint): CanvasClientPoint;
  readonly app: {
    readonly canvas?: EventTarget | null;
    readonly view?: EventTarget | null;
  };
  readonly tiles: {
    readonly active: boolean;
    readonly placeables: readonly CanvasTilePlaceable[];
  };
}

export interface TileInteractionCanvasEnvironment {
  readonly canvas: TileInteractionCanvas;
  isGM(): boolean;
  isBlockedAt(point: CanvasClientPoint): boolean;
  toggle(tile: TileInteractionTileDocument): Promise<ToggleTileInteractionResult>;
  notify(result: ToggleTileInteractionResult): void;
  now(): number;
  readonly doubleClickTime: number;
}

export interface TileInteractionCanvasSession {
  destroy(): void;
}

/** PixiJS 7 exposes view; PixiJS 8 exposes canvas. */
export function tileInteractionPointerSurface(
  app: TileInteractionCanvas["app"],
): EventTarget | null {
  return app.canvas ?? app.view ?? null;
}

interface PendingClick {
  readonly x: number;
  readonly y: number;
  readonly tile: CanvasTilePlaceable | null;
  readonly blocked: boolean;
}

function hasModifier(event: PointerEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function tileStackValue(tile: CanvasTilePlaceable): number {
  const document = tile.document;
  return document.sort ?? document.z ?? tile.mesh?.zIndex ?? 0;
}

function hitTile(
  canvas: TileInteractionCanvas,
  client: CanvasClientPoint,
): CanvasTilePlaceable | null {
  const point = canvas.canvasCoordinatesFromClient(client);
  let match: { tile: CanvasTilePlaceable; stack: number; index: number } | null = null;
  for (const [index, tile] of canvas.tiles.placeables.entries()) {
    const config = readTileInteractionConfig(tile.document);
    if (tile.document.hidden || (!tile.isVisible && !tile.hasPreview) || !config?.enabled
      || !tile.mesh?.containsCanvasPoint(point)) continue;
    const stack = tileStackValue(tile);
    if (!match || stack > match.stack || (stack === match.stack && index > match.index)) {
      match = { tile, stack, index };
    }
  }
  return match?.tile ?? null;
}

export function createTileInteractionCanvasSession(
  environment: TileInteractionCanvasEnvironment,
): TileInteractionCanvasSession {
  let pending: PendingClick | null = null;
  const inFlight = new Set<string>();
  const lastToggleAt = new Map<string, number>();
  const controller = new AbortController();
  const { canvas } = environment;
  const surface = tileInteractionPointerSurface(canvas.app);
  if (!surface) throw new Error("Tile interaction canvas has no pointer surface");

  const cancel = () => { pending = null; };
  const down = (rawEvent: Event) => {
    const event = rawEvent as PointerEvent;
    if (!environment.isGM() || canvas.tiles.active || event.button !== 0 || hasModifier(event)) {
      pending = null;
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    pending = {
      ...point,
      tile: hitTile(canvas, point),
      blocked: environment.isBlockedAt(point),
    };
  };
  const up = (rawEvent: Event) => {
    const event = rawEvent as PointerEvent;
    const start = pending;
    pending = null;
    if (!start || !start.tile || start.blocked || !environment.isGM()
      || canvas.tiles.active || event.button !== 0 || hasModifier(event)) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
    const point = { x: event.clientX, y: event.clientY };
    if (environment.isBlockedAt(point)) return;
    const end = hitTile(canvas, point);
    if (end !== start.tile) return;

    const id = start.tile.document.id;
    if (!id || inFlight.has(id)) return;
    const now = environment.now();
    const last = lastToggleAt.get(id);
    if (last !== undefined && now - last < environment.doubleClickTime) return;
    lastToggleAt.set(id, now);
    inFlight.add(id);
    void environment.toggle(start.tile.document).then(
      result => environment.notify(result),
      error => environment.notify({ status: "failed", ignoredIds: [], error }),
    ).finally(() => inFlight.delete(id));
  };

  const { signal } = controller;
  surface.addEventListener("pointerdown", down, { signal });
  surface.addEventListener("pointerup", up, { signal });
  surface.addEventListener("pointercancel", cancel, { signal });
  surface.addEventListener("pointerleave", cancel, { signal });
  surface.addEventListener("lostpointercapture", cancel, { signal });
  surface.addEventListener("blur", cancel, { signal });

  return { destroy: () => controller.abort() };
}

function notifyTileInteractionResult(result: ToggleTileInteractionResult): void {
  if (result.status === "updated") {
    if (result.ignoredIds.length > 0) {
      ui.notifications.warn(game.i18n.format(
        "ORDEMPARANORMAL2.TileInteraction.Warnings.IgnoredReferences",
        { count: result.ignoredIds.length },
      ));
    }
    return;
  }
  if (result.status === "disabled" || result.status === "forbidden"
    || result.status === "no-targets") return;
  if (result.status === "failed") {
    console.error("ordemparanormal2 | Failed to toggle Tile interaction", result.error);
    ui.notifications.error(game.i18n.localize(
      "ORDEMPARANORMAL2.TileInteraction.Errors.ExecutionFailed",
    ));
    return;
  }
  ui.notifications.warn(game.i18n.localize(
    result.status === "no-valid-walls"
      ? "ORDEMPARANORMAL2.TileInteraction.Warnings.NoValidWalls"
      : "ORDEMPARANORMAL2.TileInteraction.Warnings.InvalidConfiguration",
  ));
}

export function createFoundryTileInteractionCanvasSession(
  canvas: TileInteractionCanvas,
): TileInteractionCanvasSession {
  return createTileInteractionCanvasSession({
    canvas,
    isGM: () => !!game.user?.isGM,
    isBlockedAt: isTokenInteractionAt,
    toggle: tile => toggleTileInteraction(tile),
    notify: notifyTileInteractionResult,
    now: () => Date.now(),
    doubleClickTime:
      foundry.canvas.interaction.MouseInteractionManager.DOUBLE_CLICK_TIME_MS,
  });
}
