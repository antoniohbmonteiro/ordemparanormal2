import type { AdventureAct } from "./recognize-zip-source";
import { adventureDataRecord as record } from "./adventure-agent-data";

interface InitialVisibility { readonly hidden: boolean; readonly locked: boolean }
interface TexturePresentation {
  readonly anchorX: number; readonly anchorY: number; readonly scaleX: number; readonly scaleY: number;
  readonly tint: string; readonly fit: string; readonly alphaThreshold: number;
}
interface LightAnimation { readonly type: null; readonly speed: number; readonly intensity: number; readonly reverse: boolean }
interface LightConfiguration {
  readonly negative: boolean; readonly priority: number; readonly alpha: number; readonly angle: number;
  readonly bright: number; readonly dim: number; readonly color: string | null; readonly coloration: number;
  readonly attenuation: number; readonly luminosity: number; readonly saturation: number;
  readonly contrast: number; readonly shadows: number; readonly animation: LightAnimation;
  readonly darkness: { readonly min: number; readonly max: number };
}
interface EnvironmentColor {
  readonly hue: number; readonly intensity: number; readonly luminosity: number; readonly saturation: number; readonly shadows: number;
}
export interface SceneConfigurationPreset {
  readonly width: number; readonly height: number; readonly padding: number; readonly shiftX: number; readonly shiftY: number;
  readonly grid: { readonly type: number; readonly size: number; readonly style: string; readonly thickness: number;
    readonly color: string; readonly alpha: number; readonly distance: number; readonly units: string };
  readonly tokenVision: boolean;
  readonly fog: { readonly mode: number; readonly colors: { readonly explored: string | null; readonly unexplored: string | null } };
  readonly environment: {
    readonly darknessLevel: number; readonly darknessLock: boolean; readonly cycle: boolean;
    readonly globalLight: { readonly enabled: boolean; readonly alpha: number; readonly bright: boolean; readonly color: string | null;
      readonly coloration: number; readonly luminosity: number; readonly saturation: number; readonly contrast: number;
      readonly shadows: number; readonly darkness: { readonly min: number; readonly max: number } };
    readonly base: EnvironmentColor; readonly dark: EnvironmentColor;
  };
  readonly defaults: { readonly navigation: boolean; readonly initial: { readonly x: number | null; readonly y: number | null; readonly scale: number | null };
    readonly transition: { readonly type: null; readonly duration: number; readonly activeOnly: boolean } };
}
export interface SceneLevelPreset {
  readonly id: string; readonly name: string; readonly backgroundAssetId: string;
  readonly elevation: { readonly bottom: number; readonly top: number };
  readonly background: { readonly color: string; readonly tint: string; readonly alphaThreshold: number };
  readonly foreground: { readonly src: null; readonly tint: string; readonly alphaThreshold: number };
  readonly fog: { readonly src: null };
  readonly textures: { readonly anchorX: number; readonly anchorY: number; readonly offsetX: number; readonly offsetY: number;
    readonly fit: string; readonly scaleX: number; readonly scaleY: number; readonly rotation: number };
  readonly visibility: { readonly levels: readonly string[] }; readonly sort: number;
}
export interface SceneWallPreset {
  readonly id: string; readonly c: readonly [number, number, number, number];
  readonly light: number; readonly move: number; readonly sight: number; readonly sound: number; readonly dir: number;
  readonly door: number; readonly initialState: number;
  readonly threshold: { readonly light: number | null; readonly sight: number | null; readonly sound: number | null; readonly attenuation: boolean };
  readonly animation: { readonly type: string; readonly texture: null; readonly flip: boolean; readonly double: boolean;
    readonly direction: number; readonly duration: number; readonly strength: number } | null;
  readonly doorSound?: string;
}
export type SceneTextureAsset = { readonly kind: "system"; readonly assetId: "gmControlButton" }
  | { readonly kind: "adventure"; readonly assetId: string };
export interface SceneTilePreset {
  readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly rotation: number; readonly elevation: number; readonly sort: number; readonly alpha: number;
  readonly texture: TexturePresentation; readonly textureAsset: SceneTextureAsset; readonly initial: InitialVisibility;
  readonly occlusion: { readonly modes: readonly number[]; readonly alpha: number };
  readonly restrictions: { readonly light: boolean; readonly weather: boolean };
  readonly video: { readonly loop: boolean; readonly autoplay: boolean; readonly volume: number };
  readonly interaction: { readonly enabled: boolean; readonly wallIds: readonly string[]; readonly tileIds: readonly string[] };
}
export interface SceneTokenPreset {
  readonly id: string; readonly agentPresetId: string;
  readonly initial: InitialVisibility & { readonly x: number; readonly y: number; readonly elevation: number; readonly rotation: number };
  readonly configuration: {
    readonly texture: TexturePresentation; readonly displayName: number; readonly actorLink: true;
    readonly width: number; readonly height: number; readonly depth: number; readonly lockRotation: boolean;
    readonly alpha: number; readonly disposition: number; readonly displayBars: number;
    readonly bar1: { readonly attribute: string }; readonly bar2: { readonly attribute: string };
    readonly light: LightConfiguration;
    readonly sight: { readonly enabled: boolean; readonly range: number; readonly angle: number; readonly visionMode: string;
      readonly color: string | null; readonly attenuation: number; readonly brightness: number; readonly saturation: number; readonly contrast: number };
    readonly occludable: { readonly radius: number };
    readonly ring: { readonly enabled: boolean; readonly colors: { readonly ring: string | null; readonly background: string | null };
      readonly effects: number; readonly subject: { readonly scale: number; readonly texture: null } };
    readonly turnMarker: { readonly mode: number; readonly animation: null; readonly src: null; readonly disposition: boolean };
    readonly movementAction: null; readonly shape: number; readonly sort: number;
  };
}
export interface SceneDrawingPreset {
  readonly id: string; readonly initial: InitialVisibility; readonly x: number; readonly y: number;
  readonly rotation: number; readonly elevation: number; readonly sort: number;
  readonly strokeWidth: number; readonly strokeColor: string; readonly strokeAlpha: number; readonly bezierFactor: number;
  readonly fillType: number; readonly fillColor: string; readonly fillAlpha: number; readonly texture: null;
  readonly text: string; readonly fontFamily: string; readonly fontSize: number; readonly textColor: string; readonly textAlpha: number;
  readonly interface: boolean;
  readonly shape: { readonly type: "r"; readonly width: number; readonly height: number; readonly radius: null; readonly points: readonly number[] };
}
export interface AdventureScenePreset {
  readonly schemaVersion: 1; readonly id: string; readonly act: AdventureAct; readonly revision: number; readonly name: string;
  readonly scene: SceneConfigurationPreset; readonly level: SceneLevelPreset;
  readonly walls: readonly SceneWallPreset[]; readonly tiles: readonly SceneTilePreset[];
  readonly tokens: readonly SceneTokenPreset[]; readonly drawings: readonly SceneDrawingPreset[];
}

type Shape = ((value: unknown) => boolean) | { readonly [key: string]: Shape };
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const nonnegative = (v: unknown) => number(v) && (v as number) >= 0;
const positive = (v: unknown) => number(v) && (v as number) > 0;
const alpha = (v: unknown) => nonnegative(v) && (v as number) <= 1;
const integer = (v: unknown) => number(v) && Number.isInteger(v);
const revision = (v: unknown) => integer(v) && positive(v);
const string = (v: unknown) => typeof v === "string";
const nonblank = (v: unknown) => string(v) && (v as string).trim().length > 0;
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9]{16}$/.test(v);
const bool = (v: unknown) => typeof v === "boolean";
const nil = (v: unknown) => v === null;
const nullable = (check: (v: unknown) => boolean) => (v: unknown) => v === null || check(v);
const color = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const ids = (v: unknown) => Array.isArray(v) && v.every(id) && new Set(v).size === v.length;
const numbers = (v: unknown) => Array.isArray(v) && v.every(number);
const texture: Shape = { anchorX: number, anchorY: number, fit: nonblank, scaleX: positive, scaleY: positive, tint: color, alphaThreshold: alpha };
const initial: Shape = { hidden: bool, locked: bool };
const darkness: Shape = { min: alpha, max: alpha };
const environmentColor: Shape = { hue: alpha, intensity: alpha, luminosity: number, saturation: number, shadows: number };
const animation: Shape = { type: string, texture: nil, flip: bool, double: bool, direction: integer, duration: nonnegative, strength: number };
const tokenConfiguration: Shape = {
  texture, displayName: integer, actorLink: v => v === true, width: positive, height: positive, depth: positive,
  lockRotation: bool, alpha, disposition: integer, displayBars: integer, bar1: { attribute: nonblank }, bar2: { attribute: nonblank },
  light: { negative: bool, priority: number, alpha, angle: nonnegative, bright: nonnegative, dim: nonnegative, color: nullable(color),
    coloration: integer, attenuation: alpha, luminosity: number, saturation: number, contrast: number, shadows: number,
    animation: { type: nil, speed: number, intensity: number, reverse: bool }, darkness },
  sight: { enabled: bool, range: nonnegative, angle: nonnegative, visionMode: nonblank, color: nullable(color),
    attenuation: alpha, brightness: number, saturation: number, contrast: number },
  occludable: { radius: nonnegative },
  ring: { enabled: bool, colors: { ring: nullable(color), background: nullable(color) }, effects: integer, subject: { scale: positive, texture: nil } },
  turnMarker: { mode: integer, animation: nil, src: nil, disposition: bool }, movementAction: nil, shape: integer, sort: number,
};

export function validateAdventureSceneData(value: unknown): asserts value is AdventureScenePreset {
  const issues: string[] = [];
  function check(v: unknown, shape: Shape, path: string): void {
    if (typeof shape === "function") { if (!shape(v)) issues.push(path); return; }
    const data = record(v);
    if (!data) { issues.push(path); return; }
    for (const key of Object.keys(data)) if (!(key in shape)) issues.push(`${path}.${key}`);
    for (const [key, child] of Object.entries(shape)) check(data[key], child, `${path}.${key}`);
  }
  function list(shape: Shape): Shape {
    return v => {
      if (!Array.isArray(v)) return false;
      for (const [i, entry] of v.entries()) check(entry, shape, `embedded.${i}`);
      const keys = v.map(entry => record(entry)?.id);
      return new Set(keys).size === keys.length;
    };
  }
  check(value, {
    schemaVersion: v => v === 1, id: nonblank, act: v => v === "actOne" || v === "actTwo", revision, name: nonblank,
    scene: {
      width: positive, height: positive, padding: nonnegative, shiftX: number, shiftY: number,
      grid: { type: integer, size: positive, style: nonblank, thickness: nonnegative, color, alpha, distance: positive, units: string },
      tokenVision: bool, fog: { mode: integer, colors: { explored: nullable(color), unexplored: nullable(color) } },
      environment: { darknessLevel: alpha, darknessLock: bool, cycle: bool, base: environmentColor, dark: environmentColor,
        globalLight: { enabled: bool, alpha, bright: bool, color: nullable(color), coloration: integer, luminosity: number,
          saturation: number, contrast: number, shadows: number, darkness } },
      defaults: { navigation: bool, initial: { x: nullable(number), y: nullable(number), scale: nullable(positive) },
        transition: { type: nil, duration: nonnegative, activeOnly: bool } },
    },
    level: { id, name: nonblank, backgroundAssetId: nonblank, elevation: { bottom: number, top: number },
      background: { color, tint: color, alphaThreshold: alpha }, foreground: { src: nil, tint: color, alphaThreshold: alpha },
      fog: { src: nil }, textures: { anchorX: number, anchorY: number, offsetX: number, offsetY: number,
        fit: nonblank, scaleX: positive, scaleY: positive, rotation: number }, visibility: { levels: ids }, sort: number },
    walls: list({ id, c: v => numbers(v) && (v as number[]).length === 4, light: integer, move: integer, sight: integer,
      sound: integer, dir: integer, door: v => v === 0 || v === 1 || v === 2, initialState: v => v === 0 || v === 1 || v === 2,
      threshold: { light: nullable(nonnegative), sight: nullable(nonnegative), sound: nullable(nonnegative), attenuation: bool },
      animation: v => { if (v !== null) check(v, animation, "wall.animation"); return true; }, doorSound: v => v === undefined || string(v) }),
    tiles: list({ id, x: number, y: number, width: positive, height: positive, rotation: number, elevation: number, sort: number,
      alpha, texture, initial, occlusion: { modes: numbers, alpha }, restrictions: { light: bool, weather: bool },
      video: { loop: bool, autoplay: bool, volume: alpha },
      textureAsset: v => {
        const a = record(v);
        return !!a && Object.keys(a).length === 2 && nonblank(a.assetId)
          && ((a.kind === "system" && a.assetId === "gmControlButton") || a.kind === "adventure");
      }, interaction: { enabled: bool, wallIds: ids, tileIds: ids } }),
    tokens: list({ id, agentPresetId: nonblank, initial: { hidden: bool, locked: bool, x: number, y: number, elevation: number, rotation: number }, configuration: tokenConfiguration }),
    drawings: list({ id, initial, x: number, y: number, rotation: number, elevation: number, sort: number,
      strokeWidth: nonnegative, strokeColor: color, strokeAlpha: alpha, bezierFactor: number, fillType: integer, fillColor: color,
      fillAlpha: alpha, texture: nil, text: nonblank, fontFamily: string, fontSize: positive, textColor: color, textAlpha: alpha,
      interface: bool, shape: { type: v => v === "r", width: positive, height: positive, radius: nil, points: numbers } }),
  }, "preset");
  if (issues.length) throw new Error(`Configuração de Scene inválida: ${issues.join(", ")}`);
  const preset = value as AdventureScenePreset;
  if (!preset.id.startsWith(`${preset.act}.`) || preset.tokens.some(t => !t.agentPresetId.startsWith(`${preset.act}.`))) issues.push("act");
  if (preset.level.elevation.top <= preset.level.elevation.bottom) issues.push("level.elevation");
  if (preset.level.visibility.levels.some(key => key !== preset.level.id)) issues.push("level.visibility");
  const walls = new Map(preset.walls.map(w => [w.id, w]));
  const tiles = new Set(preset.tiles.map(t => t.id));
  if (new Set(preset.tokens.map(t => t.agentPresetId)).size !== preset.tokens.length) issues.push("tokens.agentPresetId");
  for (const tile of preset.tiles) {
    if (tile.interaction.enabled && tile.interaction.wallIds.length === 0) issues.push(`${tile.id}.wallIds`);
    if (tile.interaction.wallIds.some(key => !walls.get(key)?.door)) issues.push(`${tile.id}.wallIds`);
    if (tile.interaction.tileIds.some(key => !tiles.has(key) || key === tile.id)) issues.push(`${tile.id}.tileIds`);
  }
  if (issues.length) throw new Error(`Referências de Scene inválidas: ${issues.join(", ")}`);
}
