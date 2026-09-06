import type { Geometry, IArrayBuffer, Shader } from "pixi.js";

export interface PoiBorderStyle {
  readonly periodMs: number;
  readonly contourPhase: number;
  readonly speedVariation: number;
  readonly speedFrequency: number;
  readonly miterLimit: number;
  readonly frontLength: number;
  readonly trailLength: number;
  readonly frontBlend: number;
  readonly wine: readonly [number, number, number];
  readonly hot: readonly [number, number, number];
  readonly trailPulse: number;
  readonly trailFrequency: number;
  readonly secondaryAlpha: number;
  readonly secondaryOffset: number;
  readonly secondaryTrailScale: number;
  readonly irregularBase: number;
  readonly firstWave: { readonly amplitude: number; readonly spatialFrequency: number; readonly timeFrequency: number };
  readonly secondWave: { readonly amplitude: number; readonly spatialFrequency: number; readonly timeFrequency: number };
  readonly featherStart: number;
  readonly corePower: number;
  readonly warmthPower: number;
  readonly warmthBase: number;
  readonly warmthCore: number;
  readonly idleAlpha: number;
  readonly hoverAlpha: number;
}

const VERTEX = `
attribute vec2 aVertexPosition;
attribute vec2 aBorderPosition;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vBorder;
void main() {
  vBorder = aBorderPosition;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

// Arc length is interpolated per pixel: the travelling light has no fragment boundaries.
function fragmentSource(style: PoiBorderStyle): string {
  // GLSL requires a float literal even when the chosen art parameter is an integer.
  const f = (value: number) => Number.isInteger(value) ? `${value}.0` : String(value);
  return `
varying vec2 vBorder;
uniform float uTravel;
uniform float uTime;
uniform float uHover;
uniform float uAlpha;
uniform float uFront;
uniform float uTrail;
uniform vec3 uWine;
uniform vec3 uHot;
float ribbon(float lag, float trail) {
  float d = fract(lag + 0.5) - 0.5;
  float spread = mix(uFront, trail, smoothstep(-${f(style.frontBlend)}, ${f(style.frontBlend)}, d));
  return exp(-0.5 * d * d / (spread * spread));
}
void main() {
  float arc = vBorder.x;
  float across = abs(vBorder.y);
  float trail = uTrail * (1.0 + ${f(style.trailPulse)} * sin(uTime * ${f(style.trailFrequency)}));
  float light = ribbon(uTravel - arc, trail);
  light += uHover * ${f(style.secondaryAlpha)} * ribbon(uTravel - arc - ${f(style.secondaryOffset)},
    trail * ${f(style.secondaryTrailScale)});
  float irregular = ${f(style.irregularBase)}
    + ${f(style.firstWave.amplitude)} * sin(arc * ${f(style.firstWave.spatialFrequency)}
      + uTime * ${f(style.firstWave.timeFrequency)})
    + ${f(style.secondWave.amplitude)} * sin(arc * ${f(style.secondWave.spatialFrequency)}
      + uTime * ${f(style.secondWave.timeFrequency)});
  light = clamp(light * irregular, 0.0, 1.0);
  float feather = 1.0 - smoothstep(${f(style.featherStart)}, 1.0, across);
  float core = pow(max(0.0, 1.0 - across), ${f(style.corePower)});
  vec3 color = mix(uWine, uHot, pow(light, ${f(style.warmthPower)})
    * (${f(style.warmthBase)} + ${f(style.warmthCore)} * core));
  float alpha = feather * light * mix(${f(style.idleAlpha)}, ${f(style.hoverAlpha)}, uHover) * uAlpha;
  gl_FragColor = vec4(color * alpha, alpha);
}`;
}

/** One static ribbon per native contour; the renderer ticker updates only shader uniforms. */
export function createPoiCanvasBorder(width: number, style: PoiBorderStyle) {
  const root = new PIXI.Container();
  root.name = "poi-living-outline";
  root.eventMode = "none";
  root.interactiveChildren = false;
  const contours: { geometry: Geometry; shader: Shader; uniforms: {
    uTravel: number; uTime: number; uHover: number; uAlpha: number;
    uFront: number; uTrail: number; uWine: number[]; uHot: number[];
  }; phase: number }[] = [];
  let disposed = false;

  return {
    root,
    addContour(points: readonly number[]): void {
      if (disposed || points.length < 6 || points.length % 2 || !points.every(Number.isFinite)) return;
      const vertices: { x: number; y: number }[] = [];
      for (let i = 0; i < points.length; i += 2) {
        const last = vertices.at(-1);
        if (last?.x !== points[i] || last?.y !== points[i + 1]) vertices.push({ x: points[i], y: points[i + 1] });
      }
      if (vertices.at(-1)?.x === vertices[0].x && vertices.at(-1)?.y === vertices[0].y) vertices.pop();
      if (vertices.length < 3) return;
      const edges = vertices.map((point, i) => {
        const next = vertices[(i + 1) % vertices.length];
        const dx = next.x - point.x; const dy = next.y - point.y;
        const length = Math.hypot(dx, dy);
        return { nx: -dy / length, ny: dx / length, length };
      });
      const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);
      const positions: number[] = []; const coordinates: number[] = []; const indices: number[] = [];
      let distance = 0;
      for (let i = 0; i <= vertices.length; i++) {
        const index = i % vertices.length;
        const point = vertices[index];
        const before = edges[(index + edges.length - 1) % edges.length]; const after = edges[index];
        let nx = before.nx + after.nx; let ny = before.ny + after.ny;
        const normalLength = Math.hypot(nx, ny);
        if (normalLength > 0.0001) { nx /= normalLength; ny /= normalLength; }
        else { nx = after.nx; ny = after.ny; }
        const extension = width / 2 * Math.min(style.miterLimit,
          1 / Math.max(1 / style.miterLimit, nx * after.nx + ny * after.ny));
        positions.push(point.x + nx * extension, point.y + ny * extension,
          point.x - nx * extension, point.y - ny * extension);
        coordinates.push(distance / perimeter, 1, distance / perimeter, -1);
        if (i < vertices.length) {
          const start = i * 2;
          indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
          distance += after.length;
        }
      }
      const geometry = new PIXI.Geometry()
        .addAttribute("aVertexPosition", positions, 2)
        .addAttribute("aBorderPosition", coordinates, 2)
        // PIXI's IArrayBuffer describes typed arrays but incorrectly extends ArrayBuffer in its typings.
        .addIndex(new Uint32Array(indices) as unknown as IArrayBuffer);
      const uniforms = { uTravel: 0, uTime: 0, uHover: 0, uAlpha: 1,
        uFront: style.frontLength, uTrail: style.trailLength,
        uWine: [...style.wine], uHot: [...style.hot] };
      const shader = PIXI.Shader.from(VERTEX, fragmentSource(style), uniforms);
      const mesh = new PIXI.Mesh(geometry, shader);
      root.addChild(mesh);
      contours.push({ geometry, shader, uniforms, phase: contours.length * style.contourPhase });
    },
    paint(elapsedMs: number, regionPhase: number, hover: number): void {
      if (disposed) return;
      const seconds = elapsedMs / 1000;
      const travel = elapsedMs / style.periodMs + regionPhase / (Math.PI * 2)
        + style.speedVariation * Math.sin(seconds * style.speedFrequency);
      for (const contour of contours) {
        contour.uniforms.uTravel = ((travel + contour.phase) % 1 + 1) % 1;
        contour.uniforms.uTime = seconds;
        contour.uniforms.uHover = hover;
        contour.uniforms.uAlpha = root.worldAlpha;
      }
    },
    destroy(): void {
      if (disposed) return;
      disposed = true;
      if (!root.destroyed) root.destroy({ children: true });
      for (const contour of contours) { contour.geometry.destroy(); contour.shader.destroy(); }
      contours.length = 0;
    },
  };
}
