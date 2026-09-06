import { afterEach, describe, expect, it, vi } from "vitest";
import { createPoiCanvasRenderer, poiRegionVisualScale, POI_CANVAS_STYLE as STYLE, type PoiRenderCanvas } from "./poi-canvas-renderer";
import type { PoiGeometry } from "./poi-canvas-regions";
import { createPoiCanvasBorder } from "./poi-canvas-border";

class Node {
  name = ""; destroyed = false; visible = true; alpha = 1; worldAlpha = 1;
  eventMode = "auto"; interactiveChildren = true;
  children: Node[] = []; parent: Node | null = null; mask: Node | null = null;
  filters: Filter[] = []; filterArea = null;
  position = { set: vi.fn() }; scale = { x: 1, set: vi.fn() };
  addChild(...nodes: Node[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } return nodes[0]; }
  addChildAt(node: Node, index: number) { node.parent = this; this.children.splice(index, 0, node); }
  destroy() {
    this.destroyed = true;
    for (const child of [...this.children]) child.destroy();
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }
}
class Graphic extends Node {
  drawShape = vi.fn(() => this);
  beginFill = vi.fn(() => this);
  lineStyle = vi.fn((_width: number, _color: number) => this);
  endFill() { return this; } clear() { return this; } drawRoundedRect() { return this; }
}
class Label extends Node { text = ""; width = 80; height = 16; }
class Filter {
  private strength = 0;
  padding = 0; blendMode = 0; autoFit = true; repeatEdgePixels = false;
  get blur() { return this.strength; }
  // PIXI resets padding on blur assignment; the renderer must restore its margin.
  set blur(value: number) { this.strength = value; this.padding = value * 2; }
  destroy = vi.fn();
}
class Geometry {
  attributes: Record<string, number[]> = {};
  indices: number[] = [];
  addAttribute = vi.fn((name: string, values: number[]) => { this.attributes[name] = [...values]; return this; });
  addIndex = vi.fn((values: Uint32Array) => { this.indices = [...values]; return this; });
  destroy = vi.fn();
}
interface Uniforms {
  uTravel: number; uTime: number; uHover: number; uAlpha: number;
  uFront: number; uTrail: number; uWine: number[]; uHot: number[];
}
class Shader {
  static from = vi.fn((vertex: string, fragment: string, uniforms: Uniforms) => new Shader(vertex, fragment, uniforms));
  constructor(readonly vertex: string, readonly fragment: string, readonly uniforms: Uniforms) {}
  destroy = vi.fn();
}
class Mesh extends Node {
  constructor(readonly geometry: Geometry, readonly shader: Shader) { super(); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function fixture() {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("PIXI", { Container: Node, Graphics: Graphic, Text: Label, BlurFilter: Filter,
    Geometry, Shader, Mesh, BLEND_MODES: { ADD: 1 } });
  const parent = new Node(); const native = new Node(); parent.addChild(native);
  const callbacks = new Set<() => void>();
  const ticker = { add: vi.fn((callback: () => void) => callbacks.add(callback)),
    remove: vi.fn((callback: () => void) => callbacks.delete(callback)) };
  const canvas = { interface: parent, stage: new Node(), app: { ticker,
    view: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800 }) } },
    canvasCoordinatesFromClient: (point: { x: number; y: number }) => point } as unknown as PoiRenderCanvas;
  const visual = createPoiCanvasRenderer(canvas);
  return { parent, native, ticker, visual, canvas, callbacks, root: parent.children[1],
    advance(time: number) { now = time; for (const callback of callbacks) callback(); } };
}

const rectangle = [0, 0, 100, 0, 100, 100, 0, 100];
function geometryOf(...contours: readonly number[][]) {
  const iterate = vi.fn();
  const polygons = contours.map(points => ({ points }));
  const geometry = { area: STYLE.smallRegionThreshold ** 2, drawShape: vi.fn(),
    *[Symbol.iterator]() { iterate(); for (const polygon of polygons) yield { polygon }; } };
  return { geometry: geometry as unknown as PoiGeometry, iterate, polygons };
}
function layers(root: Node) {
  const group = root.children[0];
  const [aura, halo, fill, edge, mask] = group.children as Graphic[];
  const border = group.children[5];
  return { group, aura, halo, fill, edge, mask, border, meshes: border.children as Mesh[] };
}
function within(value: number, low: number, high: number) {
  expect(value).toBeGreaterThanOrEqual(low - Number.EPSILON);
  expect(value).toBeLessThanOrEqual(high + Number.EPSILON);
}

describe("owned POI graphics", () => {
  it("hides and pauses without rebuilding, including updates while hidden", () => {
    const f = fixture(); const g = geometryOf(rectangle);
    f.visual.setVisible(false); f.visual.upsert("r", g.geometry);
    expect(f.root.visible).toBe(false); expect(f.callbacks.size).toBe(0);
    const node = f.root.children[0]; const draws = vi.mocked(g.geometry.drawShape).mock.calls.length;
    f.visual.setVisible(true); f.visual.hover("r"); f.visual.label("Name", { x: 10, y: 20 });
    expect(f.root.visible).toBe(true); expect(f.callbacks.size).toBe(1);
    f.advance(1000); f.visual.setVisible(false);
    expect(f.callbacks.size).toBe(0); expect(f.root.children.at(-1)!.visible).toBe(false);
    f.visual.hover(null); f.visual.camera();
    expect(f.callbacks.size).toBe(0);
    f.visual.setVisible(true); f.visual.setVisible(true);
    expect(f.callbacks.size).toBe(1); expect(f.root.children[0]).toBe(node);
    expect(g.geometry.drawShape).toHaveBeenCalledTimes(draws);
    f.visual.destroy(); f.visual.setVisible(true);
    expect(f.callbacks.size).toBe(0); expect(f.native.destroyed).toBe(false);
  });
  it("scales progressively below the size threshold, clamps tiny regions and preserves larger ones", () => {
    const thresholdArea = STYLE.smallRegionThreshold ** 2;
    expect(poiRegionVisualScale(thresholdArea)).toBe(1);
    expect(poiRegionVisualScale(thresholdArea * 4)).toBe(1);
    expect(poiRegionVisualScale(0)).toBe(STYLE.minVisualScale);
    expect(poiRegionVisualScale(thresholdArea * (STYLE.minVisualScale / 2) ** 2)).toBe(STYLE.minVisualScale);
    const middle = (1 + STYLE.minVisualScale) / 2;
    expect(poiRegionVisualScale(thresholdArea * middle ** 2)).toBeCloseTo(middle);
    expect(poiRegionVisualScale(thresholdArea * (1 - 1e-6) ** 2)).toBeCloseTo(1, 5);
  });

  it.each(["idle", "hover"] as const)("scales only spatial dimensions in %s, independently of zoom", mode => {
    const f = fixture(); const g = geometryOf(rectangle);
    const compact = createPoiCanvasRenderer(f.canvas);
    const smallRoot = f.parent.children.at(-1)!;
    const factor = (1 + STYLE.minVisualScale) / 2;
    const readArea = vi.fn(() => (STYLE.smallRegionThreshold * factor) ** 2);
    const smallGeometry = { ...g.geometry, get area() { return readArea(); } };
    f.visual.upsert("r", g.geometry); compact.upsert("r", smallGeometry);
    const full = layers(f.root); const small = layers(smallRoot);
    const start = mode === "hover" ? STYLE.transition.enterMs : 0;
    if (mode === "hover") { f.visual.hover("r"); compact.hover("r"); }
    for (const [a, b] of [[full.edge, small.edge], [full.halo, small.halo], [full.aura, small.aura]]) {
      expect(b.lineStyle.mock.calls[0][0]).toBeCloseTo(a.lineStyle.mock.calls[0][0] * factor);
      expect(b.lineStyle.mock.calls[0][1]).toBe(a.lineStyle.mock.calls[0][1]);
    }
    expect(full.edge.lineStyle.mock.calls[0][0]).toBe(STYLE.edgeWidth * 2);
    expect(full.halo.lineStyle.mock.calls[0][0]).toBe(STYLE.haloWidth);
    expect(full.aura.lineStyle.mock.calls[0][0]).toBe(STYLE.auraWidth);
    // Ribbon vertices stay centered on the native perimeter; only the stroke's cross section shrinks.
    const original = full.meshes[0].geometry.attributes.aVertexPosition;
    const scaled = small.meshes[0].geometry.attributes.aVertexPosition;
    for (let i = 0; i < original.length; i += 4) {
      for (const offset of [0, 1]) {
        const center = (original[i + offset] + original[i + offset + 2]) / 2;
        expect((scaled[i + offset] + scaled[i + offset + 2]) / 2).toBeCloseTo(center);
        expect(scaled[i + offset] - center).toBeCloseTo((original[i + offset] - center) * factor);
      }
    }
    for (let step = 0; step <= 16; step++) {
      f.advance(start + STYLE.periodMs * step / 16);
      for (const [a, b] of [[full.edge, small.edge], [full.halo, small.halo], [full.aura, small.aura], [full.fill, small.fill]]) {
        expect(b.alpha).toBe(a.alpha);
      }
      for (const [a, b] of [[full.halo, small.halo], [full.aura, small.aura]]) {
        expect(b.filters[0].blur).toBeCloseTo(a.filters[0].blur * factor);
        expect(b.filters[0].padding).toBeCloseTo(a.filters[0].padding * factor);
      }
      expect(small.meshes[0].shader.uniforms).toEqual(full.meshes[0].shader.uniforms);
    }
    const beforeZoom = small.halo.filters[0].blur;
    f.canvas.stage.scale.x = 2; f.visual.camera(); compact.camera();
    expect(small.halo.filters[0].blur).toBeCloseTo(beforeZoom * 2);
    expect(readArea).toHaveBeenCalledOnce();
    const atThreshold = { ...g.geometry, area: STYLE.smallRegionThreshold ** 2 };
    compact.upsert("r", atThreshold);
    expect(layers(smallRoot).halo.lineStyle.mock.calls[0][0]).toBe(STYLE.haloWidth);
    expect(layers(smallRoot).halo.filters[0].blur).toBe(full.halo.filters[0].blur);
    compact.destroy(); f.visual.destroy();
  });

  it("delegates composed fill/mask to PolygonTree and keeps holes and islands as separate ribbons", () => {
    const f = fixture();
    const contours = [rectangle, [10, 10, 10, 20, 20, 20, 20, 10], [300, 300, 400, 300, 400, 400, 300, 400]];
    const g = geometryOf(...contours);
    f.visual.upsert("r", g.geometry);
    const l = layers(f.root);
    expect(g.geometry.drawShape).toHaveBeenNthCalledWith(1, l.fill);
    expect(g.geometry.drawShape).toHaveBeenNthCalledWith(2, l.mask);
    for (const graphic of [l.aura, l.halo, l.edge]) expect(graphic.drawShape.mock.calls).toEqual(g.polygons.map(p => [p]));
    expect(l.edge.mask).toBe(l.mask); expect(l.border.mask).toBe(l.mask);
    expect(l.meshes).toHaveLength(contours.length);
    l.meshes.forEach((mesh, index) => {
      const positions = mesh.geometry.attributes.aVertexPosition;
      const arc = mesh.geometry.attributes.aBorderPosition;
      const points = contours[index];
      for (let i = 0; i < points.length / 2; i++) {
        expect((positions[i * 4] + positions[i * 4 + 2]) / 2).toBeCloseTo(points[i * 2]);
        expect((positions[i * 4 + 1] + positions[i * 4 + 3]) / 2).toBeCloseTo(points[i * 2 + 1]);
      }
      expect(positions.slice(-4)).toEqual(positions.slice(0, 4));
      expect(arc[0]).toBe(0); expect(arc.at(-2)).toBe(1);
      for (const vertex of mesh.geometry.indices) expect(vertex).toBeLessThan(positions.length / 2);
    });
    expect(f.root.eventMode).toBe("none"); expect(f.root.interactiveChildren).toBe(false);
    f.visual.destroy();
  });

  it.each(["idle", "hover"] as const)("keeps %s pulsation within configured bounds without rebuilding graphics", mode => {
    const f = fixture(); const g = geometryOf(rectangle);
    f.visual.upsert("r", g.geometry);
    const l = layers(f.root); const mesh = l.meshes[0];
    const originalVertices = structuredClone(mesh.geometry.attributes);
    const start = mode === "hover" ? STYLE.transition.enterMs : 0;
    if (mode === "hover") f.visual.hover("r");
    f.advance(start);
    const travelSamples = new Set<number>();
    const state = STYLE[mode]; const samples: number[] = [];
    for (let step = 0; step <= 32; step++) {
      f.advance(start + STYLE.periodMs * step / 32);
      travelSamples.add(mesh.shader.uniforms.uTravel);
      for (const [graphic, base] of [[l.aura, state.auraAlpha], [l.halo, state.haloAlpha], [l.fill, state.fillAlpha]] as const) {
        within(graphic.alpha, base * (1 - state.pulse), Math.min(1, base * (1 + state.pulse)));
      }
      expect(Math.max(l.edge.alpha, l.halo.alpha, l.aura.alpha)).toBeGreaterThan(0);
      within(l.edge.alpha, 0, 1);
      within(l.halo.filters[0].blur, state.blur * (1 - state.spreadPulse), state.blur * (1 + state.spreadPulse));
      within(l.aura.filters[0].blur, state.auraBlur * (1 - state.spreadPulse), state.auraBlur * (1 + state.spreadPulse));
      for (const light of [l.aura, l.halo]) {
        expect(light.filters[0].padding).toBeCloseTo(light.filters[0].blur * STYLE.filterPaddingMultiplier);
      }
      samples.push(l.halo.alpha);
      expect(layers(f.root).group).toBe(l.group);
    }
    expect(samples.at(-1)).toBeCloseTo(samples[0]);
    if (state.pulse > 0 && state.haloAlpha > 0) expect(Math.max(...samples)).toBeGreaterThan(Math.min(...samples));
    expect(mesh.shader.uniforms.uTime).toBeGreaterThan(0);
    expect(travelSamples.size).toBeGreaterThan(1);
    expect(mesh.geometry.attributes).toEqual(originalVertices);
    expect(mesh.geometry.addAttribute).toHaveBeenCalledTimes(2);
    expect(mesh.geometry.addIndex).toHaveBeenCalledOnce(); expect(Shader.from).toHaveBeenCalledOnce();
    expect(g.iterate).toHaveBeenCalledOnce(); expect(g.geometry.drawShape).toHaveBeenCalledTimes(2);
    f.visual.upsert("r", g.geometry); expect(layers(f.root).group).toBe(l.group);
    const blur = l.aura.filters[0].blur;
    f.canvas.stage.scale.x = 2; f.visual.camera();
    expect(l.aura.filters[0].blur).toBeCloseTo(blur * 2);
    expect(g.iterate).toHaveBeenCalledOnce();
    f.visual.destroy();
  });

  it("makes hover more intense than idle at the same animation phase", () => {
    const f = fixture(); const g = geometryOf(rectangle);
    const hovered = createPoiCanvasRenderer(f.canvas);
    const hoverRoot = f.parent.children.at(-1)!;
    f.visual.upsert("r", g.geometry); hovered.upsert("r", g.geometry); hovered.hover("r");
    const idle = layers(f.root); const active = layers(hoverRoot);
    for (let step = 0; step < 32; step++) {
      f.advance(STYLE.transition.enterMs + STYLE.periodMs * step / 32);
      const normal = [idle.aura.alpha, idle.halo.alpha, idle.fill.alpha, idle.edge.alpha];
      const intense = [active.aura.alpha, active.halo.alpha, active.fill.alpha, active.edge.alpha];
      intense.forEach((alpha, i) => expect(alpha).toBeGreaterThanOrEqual(normal[i]));
      expect(intense.some((alpha, i) => alpha > normal[i])).toBe(true);
      expect(active.meshes[0].shader.uniforms.uHover).toBe(1);
      expect(idle.meshes[0].shader.uniforms.uHover).toBe(0);
    }
    expect(STYLE.border.hoverAlpha).toBeGreaterThanOrEqual(STYLE.border.idleAlpha);
    hovered.destroy(); f.visual.destroy();
  });

  it("preserves phase on geometry updates and reverses hover from its current intensity", () => {
    const f = fixture(); const g = geometryOf(rectangle);
    f.visual.upsert("r", g.geometry); f.advance(STYLE.periodMs / 3);
    const old = layers(f.root); const travel = old.meshes[0].shader.uniforms.uTravel;
    f.visual.upsert("r", { ...g.geometry });
    const l = layers(f.root); const uniforms = l.meshes[0].shader.uniforms;
    expect(old.meshes[0].geometry.destroy).toHaveBeenCalledOnce();
    expect(uniforms.uTravel).toBeCloseTo(travel);
    f.visual.hover("r");
    const mid = STYLE.periodMs / 3 + STYLE.transition.enterMs / 2;
    f.advance(mid); const entering = uniforms.uHover;
    expect(entering).toBeGreaterThan(0); expect(entering).toBeLessThan(1);
    f.visual.hover(null); f.advance(mid); expect(uniforms.uHover).toBe(entering);
    f.advance(mid + STYLE.transition.leaveMs / 2); expect(uniforms.uHover).toBeLessThan(entering);
    const leaving = uniforms.uHover;
    f.visual.hover("r"); f.advance(mid + STYLE.transition.leaveMs / 2); expect(uniforms.uHover).toBe(leaving);
    f.visual.destroy();
  });

  it("keeps halos unmasked, preserves native resources and disposes its own filters, meshes and shaders once", () => {
    const f = fixture(); const nativeFilter = new Filter(); f.parent.filters = [nativeFilter];
    const g = geometryOf(rectangle); f.visual.upsert("r", g.geometry);
    const l = layers(f.root); const meshes = [...l.meshes];
    for (const light of [l.aura, l.halo]) {
      expect(light.mask).toBeNull(); expect(light.filterArea).toBeNull();
      expect(light.filters[0]).toMatchObject({ blendMode: 1, autoFit: false, repeatEdgePixels: false });
    }
    for (const container of [f.root, l.group]) {
      expect(container.alpha).toBe(1); expect(container.mask).toBeNull(); expect(container.filters).toEqual([]);
    }
    f.visual.hover("r"); f.visual.label("POI name", { x: 100, y: 100 });
    const label = f.root.children.at(-1)!; expect(label.visible).toBe(true);
    f.visual.remove("r"); expect(label.visible).toBe(false);
    f.visual.destroy(); f.visual.destroy();
    for (const mesh of meshes) {
      expect(mesh.destroyed).toBe(true);
      expect(mesh.geometry.destroy).toHaveBeenCalledOnce(); expect(mesh.shader.destroy).toHaveBeenCalledOnce();
    }
    expect(l.aura.filters[0].destroy).toHaveBeenCalledOnce(); expect(l.halo.filters[0].destroy).toHaveBeenCalledOnce();
    expect(nativeFilter.destroy).not.toHaveBeenCalled(); expect(f.parent.filters).toEqual([nativeFilter]);
    expect(f.native.destroyed).toBe(false); expect(f.callbacks.size).toBe(0);
    expect(f.parent.children).toEqual([f.native]);
  });

  it("keeps one ticker until the last node leaves and handles native parent destruction", () => {
    const f = fixture(); const g = geometryOf(rectangle);
    expect(f.callbacks.size).toBe(0);
    f.visual.upsert("a", g.geometry); f.visual.upsert("b", g.geometry);
    expect(f.ticker.add).toHaveBeenCalledOnce();
    const mesh = layers(f.root).meshes[0];
    f.visual.remove("b"); expect(f.callbacks.size).toBe(1);
    f.visual.remove("a"); expect(f.callbacks.size).toBe(0);
    f.visual.upsert("a", g.geometry); expect(f.callbacks.size).toBe(1);
    const lastMesh = layers(f.root).meshes[0];
    f.root.destroy(); f.advance(STYLE.periodMs); expect(f.callbacks.size).toBe(0);
    f.visual.destroy(); f.visual.destroy();
    expect(mesh.geometry.destroy).toHaveBeenCalledOnce(); expect(f.native.destroyed).toBe(false);
    expect(lastMesh.geometry.destroy).toHaveBeenCalledOnce(); expect(lastMesh.shader.destroy).toHaveBeenCalledOnce();
  });

  it("uses the central border configuration and safely ignores degenerate contours", () => {
    const f = fixture(); const border = createPoiCanvasBorder(STYLE.edgeWidth * 2, STYLE.border);
    border.addContour([]); border.addContour([1, 1, 1, 1, 1, 1]); expect(border.root.children).toHaveLength(0);
    border.addContour(Object.freeze([...rectangle, 0, 0]));
    const mesh = border.root.children[0] as unknown as Mesh;
    expect(mesh.shader.uniforms).toMatchObject({ uFront: STYLE.border.frontLength, uTrail: STYLE.border.trailLength,
      uWine: STYLE.border.wine, uHot: STYLE.border.hot });
    border.root.worldAlpha = 0.5; border.paint(STYLE.border.periodMs, 0, 1);
    expect(mesh.shader.uniforms.uAlpha).toBe(border.root.worldAlpha);
    within(mesh.shader.uniforms.uTravel, 0, 1);
    border.destroy(); border.destroy();
    expect(mesh.geometry.destroy).toHaveBeenCalledOnce(); expect(mesh.shader.destroy).toHaveBeenCalledOnce();
    f.visual.destroy();
  });
});
