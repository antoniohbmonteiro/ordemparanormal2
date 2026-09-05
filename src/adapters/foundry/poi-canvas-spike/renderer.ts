import type Canvas from "@client/canvas/board.mjs";
import type RegionDocument from "@client/documents/region.mjs";
import { SYSTEM_ID } from "../../../config/system-config";
import { POI_SPIKE_FLAG, readPoiSpikePlacement } from "./placement";

export type PoiSpikeRegion = Pick<RegionDocument, "id" | "parent" | "getFlag" | "polygons" | "polygonTree" | "levels">;

interface Overlay {
  region: PoiSpikeRegion;
  graphics: PIXI.Graphics;
  hovered: boolean;
}

export class PoiSpikeRenderer {
  readonly container = new PIXI.Container();
  private readonly overlays = new Map<string, Overlay>();
  private readonly view: HTMLCanvasElement;
  private pointer: { x: number; y: number } | null = null;
  private frame: number | null = null;
  private disposed = false;
  private readonly sceneId: string;

  constructor(private readonly board: Canvas) {
    if (!board.scene) throw new Error("POI renderer requires a viewed Scene");
    this.sceneId = board.scene.id;
    // PIXI's ICanvas type also permits offscreen canvases; Foundry uses an HTML canvas.
    this.view = board.app.view as HTMLCanvasElement;
    this.container.name = "ordemparanormal2-poi-canvas-spike";
    this.container.eventMode = "none";
    board.interface.addChild(this.container);
    this.view.addEventListener("pointermove", this.onPointerMove);
    this.view.addEventListener("pointerleave", this.onPointerLeave);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY };
    this.refreshHover();
  };

  private readonly onPointerLeave = (): void => {
    this.pointer = null;
    this.refreshHover();
  };

  private draw(overlay: Overlay): void {
    const graphics = overlay.graphics;
    graphics.clear().lineStyle(overlay.hovered ? 6 : 3, overlay.hovered ? 0xffcc00 : 0x00ccff, 1);
    // Resolved Region boundaries include concavity, multiple shapes and holes.
    for (const polygon of overlay.region.polygons) graphics.drawPolygon(polygon);
  }

  upsert(region: PoiSpikeRegion): void {
    if (this.disposed || region.parent?.id !== this.sceneId || !region.id) return;
    this.remove(region);
    if (!readPoiSpikePlacement(region.getFlag(SYSTEM_ID, POI_SPIKE_FLAG))) return;
    if (region.levels.size && (!this.board.level || !region.levels.has(this.board.level.id))) return;
    const overlay = { region, graphics: new PIXI.Graphics(), hovered: false };
    overlay.graphics.name = `poi-region-${region.id}`;
    this.container.addChild(overlay.graphics);
    this.overlays.set(region.id, overlay);
    this.draw(overlay);
    this.refreshHover();
  }

  remove(region: Pick<PoiSpikeRegion, "id" | "parent">): void {
    if (region.parent?.id !== this.sceneId || !region.id) return;
    const overlay = this.overlays.get(region.id);
    if (!overlay) return;
    this.overlays.delete(region.id);
    this.container.removeChild(overlay.graphics);
    overlay.graphics.destroy();
  }

  refreshHover(): void {
    if (this.disposed) return;
    const point = this.pointer ? this.board.canvasCoordinatesFromClient(this.pointer) : null;
    for (const overlay of this.overlays.values()) {
      const hovered = point !== null && overlay.region.polygonTree.testPoint(point);
      if (hovered === overlay.hovered) continue;
      overlay.hovered = hovered;
      this.draw(overlay);
    }
  }

  readonly onPan = (): void => {
    if (this.disposed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.refreshHover();
    });
  };

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.view.removeEventListener("pointermove", this.onPointerMove);
    this.view.removeEventListener("pointerleave", this.onPointerLeave);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.pointer = null;
    this.overlays.clear();
    this.container.parent?.removeChild(this.container);
    if (!this.container.destroyed) this.container.destroy({ children: true });
  }
}
