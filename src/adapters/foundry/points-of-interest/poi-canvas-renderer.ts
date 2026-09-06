import type { Application, BlurFilter, Container, Graphics, Text } from "pixi.js";
import type { PoiGeometry, PoiPoint } from "./poi-canvas-regions";
import { createPoiCanvasBorder, type PoiBorderStyle } from "./poi-canvas-border";

// Internal art direction. Widths are canvas pixels at 100% zoom; durations are milliseconds.
export const POI_CANVAS_STYLE = {
  smallRegionThreshold: 100, // Equivalent square side: sqrt(native composed area), in canvas pixels.
  minVisualScale: 0.4,
  wine: 0x8C233B,
  halo: 0xC92F48,
  aura: 0x7D1733,
  edge: 0xB02D46,
  haloWidth: 10,
  auraWidth: 8,
  blurQuality: 4,
  auraBlurQuality: 4,
  filterPaddingMultiplier: 4,
  edgeWidth: 3, // Visible internal width; the centered stroke is clipped by the native mask.
  periodMs: 3000,
  harmonicWeight: 0.15,
  harmonicFrequency: 2,
  auraPhaseLag: 1.2,
  transition: { enterMs: 150, leaveMs: 200 },
  idle: { haloAlpha: 0.42, auraAlpha: 0.25, edgeAlpha: 0.76, fillAlpha: 0.025,
    blur: 7, auraBlur: 16, pulse: 0.12, spreadPulse: 0.10 },
  hover: { haloAlpha: 0.64, auraAlpha: 0.38, edgeAlpha: 0.90, fillAlpha: 0.06,
    blur: 10, auraBlur: 22, pulse: 0.16, spreadPulse: 0.14 },
  border: {
    periodMs: 7200, contourPhase: 0.37, speedVariation: 0.035, speedFrequency: 0.8,
    miterLimit: 3,
    frontLength: 0.022, trailLength: 0.15, frontBlend: 0.012, // Fractions of the perimeter.
    wine: [0.66, 0.075, 0.15], hot: [1, 0.57, 0.45], // RGB channels in 0..1.
    trailPulse: 0.18, trailFrequency: 0.9,
    secondaryAlpha: 0.48, secondaryOffset: 0.52, secondaryTrailScale: 0.65,
    irregularBase: 0.88,
    firstWave: { amplitude: 0.07, spatialFrequency: 18.849556, timeFrequency: -2.3 },
    secondWave: { amplitude: 0.05, spatialFrequency: 43.982297, timeFrequency: 3.1 },
    featherStart: 0.55, corePower: 2, warmthPower: 0.7, warmthBase: 0.45, warmthCore: 0.55,
    idleAlpha: 0.90, hoverAlpha: 1,
  } satisfies PoiBorderStyle,
  label: {
    fontFamily: "Arial", fontSize: 14, color: 0xF2E9DC, maxWidth: 280,
    paddingX: 8, paddingY: 5, background: 0x191519, backgroundAlpha: 0.94,
    radius: 4, pointerOffset: 14,
  },
};

export function poiRegionVisualScale(area: number): number {
  return Math.max(POI_CANVAS_STYLE.minVisualScale,
    Math.min(1, Math.sqrt(Math.max(0, area)) / POI_CANVAS_STYLE.smallRegionThreshold));
}

export interface PoiVisuals {
  upsert(id: string, geometry: PoiGeometry): void;
  remove(id: string): void;
  hover(id: string | null): void;
  label(text: string | null, client: PoiPoint | null): void;
  camera(): void;
  destroy(): void;
}

export interface PoiRenderCanvas {
  readonly interface: Container;
  readonly stage: Container;
  readonly app: Application<HTMLCanvasElement>;
  canvasCoordinatesFromClient(point: PoiPoint): PoiPoint;
}

interface VisualNode {
  readonly root: Container;
  readonly halo: Graphics;
  readonly aura: Graphics;
  readonly edge: Graphics;
  readonly fill: Graphics;
  readonly blur: BlurFilter;
  readonly auraBlur: BlurFilter;
  readonly geometry: PoiGeometry;
  readonly visualScale: number;
  readonly phase: number;
  readonly border: ReturnType<typeof createPoiCanvasBorder>;
  value: number;
  from: number;
  target: number;
  started: number;
}

export function createPoiCanvasRenderer(canvas: PoiRenderCanvas): PoiVisuals {
  const root = new PIXI.Container();
  root.name = "ordemparanormal2-poi";
  root.eventMode = "none";
  root.interactiveChildren = false;
  canvas.interface.addChild(root);
  const nodes = new Map<string, VisualNode>();
  const labelRoot = new PIXI.Container();
  const background = new PIXI.Graphics();
  const text: Text = new PIXI.Text("", {
    fontFamily: POI_CANVAS_STYLE.label.fontFamily, fontSize: POI_CANVAS_STYLE.label.fontSize,
    fill: POI_CANVAS_STYLE.label.color, wordWrap: true, wordWrapWidth: POI_CANVAS_STYLE.label.maxWidth,
  });
  text.position.set(POI_CANVAS_STYLE.label.paddingX, POI_CANVAS_STYLE.label.paddingY);
  labelRoot.addChild(background, text);
  labelRoot.visible = false;
  root.addChild(labelRoot);
  let disposed = false;
  let ticking = false;
  let hovered: string | null = null;
  const animationStarted = performance.now();

  function startTicker(): void {
    if (!ticking && nodes.size && !disposed) { canvas.app.ticker.add(tick); ticking = true; }
  }

  function stopTicker(): void {
    if (ticking) { canvas.app.ticker.remove(tick); ticking = false; }
  }

  function paint(node: VisualNode, now: number): void {
    const phase = ((now - animationStarted) / POI_CANVAS_STYLE.periodMs) * Math.PI * 2 + node.phase;
    const breath = (1 - POI_CANVAS_STYLE.harmonicWeight) * Math.sin(phase)
      + POI_CANVAS_STYLE.harmonicWeight * Math.sin(POI_CANVAS_STYLE.harmonicFrequency * phase);
    const outerBreath = Math.sin(phase - POI_CANVAS_STYLE.auraPhaseLag);
    const mix = (key: keyof typeof POI_CANVAS_STYLE.idle) => POI_CANVAS_STYLE.idle[key] + node.value * (POI_CANVAS_STYLE.hover[key] - POI_CANVAS_STYLE.idle[key]);
    const intensity = 1 + breath * mix("pulse");
    node.halo.alpha = Math.min(1, mix("haloAlpha") * intensity);
    node.aura.alpha = Math.min(1, mix("auraAlpha") * (1 + outerBreath * mix("pulse")));
    node.edge.alpha = Math.min(1, mix("edgeAlpha"));
    node.fill.alpha = mix("fillAlpha") * intensity;
    const scale = canvas.stage.scale.x * node.visualScale;
    node.blur.blur = mix("blur") * (1 + breath * mix("spreadPulse")) * scale;
    node.auraBlur.blur = mix("auraBlur") * (1 + outerBreath * mix("spreadPulse")) * scale;
    // BlurFilter resets padding whenever blur changes, including breathing and zoom.
    node.blur.padding = node.blur.blur * POI_CANVAS_STYLE.filterPaddingMultiplier;
    node.auraBlur.padding = node.auraBlur.blur * POI_CANVAS_STYLE.filterPaddingMultiplier;
    node.border.paint(now - animationStarted, node.phase, node.value);
  }

  function tick(): void {
    if (disposed || root.destroyed) { stopTicker(); return; }
    const now = performance.now();
    for (const node of nodes.values()) {
      if (node.value !== node.target) {
        const duration = node.target ? POI_CANVAS_STYLE.transition.enterMs : POI_CANVAS_STYLE.transition.leaveMs;
        const progress = Math.min(1, (now - node.started) / duration);
        node.value = node.from + (node.target - node.from) * progress * progress * (3 - 2 * progress);
        if (progress === 1) node.value = node.target;
      }
      paint(node, now);
    }
  }

  function remove(id: string): void {
    const node = nodes.get(id);
    if (!node) return;
    nodes.delete(id);
    node.border.destroy();
    if (!node.root.destroyed) node.root.destroy({ children: true });
    node.blur.destroy();
    node.auraBlur.destroy();
    if (hovered === id) { hovered = null; labelRoot.visible = false; }
    if (!nodes.size) stopTicker();
  }

  return {
    upsert(id, geometry) {
      if (disposed || nodes.get(id)?.geometry === geometry) return;
      const wasHovered = hovered === id;
      remove(id);
      const group = new PIXI.Container();
      group.name = id;
      const visualScale = poiRegionVisualScale(geometry.area);
      const halo = new PIXI.Graphics().lineStyle(POI_CANVAS_STYLE.haloWidth * visualScale, POI_CANVAS_STYLE.halo);
      const aura = new PIXI.Graphics().lineStyle(POI_CANVAS_STYLE.auraWidth * visualScale, POI_CANVAS_STYLE.aura);
      const edge = new PIXI.Graphics().lineStyle(POI_CANVAS_STYLE.edgeWidth * 2 * visualScale, POI_CANVAS_STYLE.edge);
      const border = createPoiCanvasBorder(POI_CANVAS_STYLE.edgeWidth * 2 * visualScale, POI_CANVAS_STYLE.border);
      for (const node of geometry) {
        if (node.polygon) {
          aura.drawShape(node.polygon); halo.drawShape(node.polygon); edge.drawShape(node.polygon);
          border.addContour(node.polygon.points);
        }
      }
      const fill = new PIXI.Graphics().beginFill(POI_CANVAS_STYLE.wine);
      geometry.drawShape(fill); fill.endFill();
      const mask = new PIXI.Graphics().beginFill(0xFFFFFF);
      geometry.drawShape(mask); mask.endFill();
      edge.mask = mask;
      border.root.mask = mask;
      const blur = new PIXI.BlurFilter(POI_CANVAS_STYLE.idle.blur * canvas.stage.scale.x * visualScale, POI_CANVAS_STYLE.blurQuality);
      const auraBlur = new PIXI.BlurFilter(POI_CANVAS_STYLE.idle.auraBlur * canvas.stage.scale.x * visualScale, POI_CANVAS_STYLE.auraBlurQuality);
      for (const filter of [blur, auraBlur]) {
        // Blend the filtered light, not just the source stroke in its offscreen texture.
        filter.blendMode = PIXI.BLEND_MODES.ADD;
        filter.repeatEdgePixels = false;
        filter.autoFit = false;
      }
      halo.filters = [blur];
      aura.filters = [auraBlur];
      group.addChild(aura, halo, fill, edge, mask, border.root);
      root.addChildAt(group, Math.max(0, root.children.length - 1));
      // Keep each Region's breathing phase stable across geometry rebuilds.
      const phase = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const node: VisualNode = { root: group, aura, halo, edge, fill, blur, auraBlur, geometry, visualScale, phase, border,
        value: wasHovered ? 1 : 0, from: 0, target: wasHovered ? 1 : 0, started: 0 };
      nodes.set(id, node);
      if (wasHovered) hovered = id;
      paint(node, performance.now());
      startTicker();
    },
    remove,
    hover(id) {
      if (disposed || hovered === id) return;
      hovered = id;
      for (const [key, node] of nodes) {
        const target = key === id ? 1 : 0;
        if (node.target === target) continue;
        node.from = node.value; node.target = target; node.started = performance.now();
      }
      startTicker();
    },
    label(value, client) {
      if (disposed) return;
      labelRoot.visible = value !== null && client !== null;
      if (value === null || client === null) return;
      if (text.text !== value) {
        text.text = value;
        background.clear().beginFill(POI_CANVAS_STYLE.label.background, POI_CANVAS_STYLE.label.backgroundAlpha)
          .drawRoundedRect(0, 0, text.width + 2 * POI_CANVAS_STYLE.label.paddingX,
            text.height + 2 * POI_CANVAS_STYLE.label.paddingY, POI_CANVAS_STYLE.label.radius).endFill();
      }
      const rect = canvas.app.view.getBoundingClientRect();
      const x = Math.max(rect.left, Math.min(client.x + POI_CANVAS_STYLE.label.pointerOffset,
        rect.right - text.width - 2 * POI_CANVAS_STYLE.label.paddingX));
      const y = Math.max(rect.top, Math.min(client.y + POI_CANVAS_STYLE.label.pointerOffset,
        rect.bottom - text.height - 2 * POI_CANVAS_STYLE.label.paddingY));
      const point = canvas.canvasCoordinatesFromClient({ x, y });
      labelRoot.position.set(point.x, point.y);
      labelRoot.scale.set(1 / canvas.stage.scale.x);
    },
    camera() {
      if (disposed) return;
      const now = performance.now();
      for (const node of nodes.values()) paint(node, now);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      stopTicker();
      for (const id of [...nodes.keys()]) remove(id);
      if (!root.destroyed) root.destroy({ children: true });
    },
  };
}
