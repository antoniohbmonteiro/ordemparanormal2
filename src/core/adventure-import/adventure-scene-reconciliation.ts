import { adventureDataRecord as record } from "./adventure-agent-data";
import { importFlag, managedDigest, stableSerialize } from "./adventure-agent-reconciliation";
import type { AdventureScenePreset } from "./adventure-scene-data";
import type { AdventureAct } from "./recognize-zip-source";

export const SCENE_IMPORT_FLAG_PATH = "flags.ordemparanormal2.adventureImport";
export const SCENE_COLLECTIONS = { Level: "levels", Wall: "walls", Tile: "tiles", Token: "tokens", Drawing: "drawings" } as const;
export type SceneEmbeddedType = keyof typeof SCENE_COLLECTIONS;
export interface SceneEmbeddedSource extends Record<string, unknown> { readonly _id: string; readonly flags?: Record<string, unknown> }
export interface AdventureSceneSource extends Record<string, unknown> {
  readonly _id: string; readonly name: string; readonly flags?: Record<string, unknown>;
  readonly levels: readonly SceneEmbeddedSource[]; readonly walls: readonly SceneEmbeddedSource[];
  readonly tiles: readonly SceneEmbeddedSource[]; readonly tokens: readonly SceneEmbeddedSource[]; readonly drawings: readonly SceneEmbeddedSource[];
}
export interface SceneEmbeddedFlag {
  readonly importer: "sceneEmbedded"; readonly adventureId: string; readonly documentId: string;
  readonly embeddedType: SceneEmbeddedType; readonly embeddedId: string; readonly version: 1;
}
export interface SceneBaseline {
  readonly digest: string;
  readonly embedded: readonly { readonly type: SceneEmbeddedType; readonly id: string; readonly digest: string }[];
}
export interface SceneImportFlag {
  readonly importer: "scene"; readonly adventureId: string; readonly documentId: string; readonly version: 1;
  readonly presetId: string; readonly presetRevision: number; readonly act: AdventureAct;
  readonly state: "incomplete" | "complete"; readonly baseline?: SceneBaseline;
}
export interface SceneEmbeddedChange {
  readonly type: SceneEmbeddedType; readonly creates: readonly SceneEmbeddedSource[];
  readonly updates: readonly SceneEmbeddedSource[]; readonly deletes: readonly string[];
}

export function pickSceneFields(source: Readonly<Record<string, unknown>>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(k => source[k] !== undefined).map(k => [k, structuredClone(source[k])]));
}
export function sceneConfigurationProjection(scene: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { ...pickSceneFields(scene, ["width", "height", "padding", "shiftX", "shiftY", "grid", "tokenVision", "environment"]),
    fog: pickSceneFields(record(scene.fog) ?? {}, ["mode", "colors"]) };
}
const EMBEDDED_KEYS: Readonly<Record<SceneEmbeddedType, readonly string[]>> = {
  Level: ["elevation", "background", "foreground", "fog", "textures", "visibility", "sort"],
  Wall: ["c", "levels", "light", "move", "sight", "sound", "dir", "door", "threshold", "animation", "doorSound"],
  Tile: ["x", "y", "width", "height", "rotation", "elevation", "sort", "alpha", "texture", "levels", "occlusion", "restrictions", "video"],
  Token: ["actorId", "actorLink", "displayName", "width", "height", "depth", "lockRotation", "alpha", "disposition", "displayBars",
    "bar1", "bar2", "light", "sight", "occludable", "ring", "turnMarker", "movementAction", "shape", "sort", "texture"],
  Drawing: ["x", "y", "rotation", "elevation", "sort", "levels", "strokeWidth", "strokeColor", "strokeAlpha", "bezierFactor",
    "fillType", "fillColor", "fillAlpha", "texture", "text", "fontFamily", "fontSize", "textColor", "textAlpha", "interface", "shape"],
};
const TEXTURE_KEYS = ["src", "anchorX", "anchorY", "scaleX", "scaleY", "tint", "fit", "alphaThreshold"];
export function sceneEmbeddedProjection(type: SceneEmbeddedType, source: SceneEmbeddedSource): Record<string, unknown> {
  const data = pickSceneFields(source, EMBEDDED_KEYS[type]);
  if (type === "Token" || type === "Tile") data.texture = pickSceneFields(record(source.texture) ?? {}, TEXTURE_KEYS);
  if (type === "Wall") data.doorSound = source.doorSound ?? "";
  return { ...data, flag: importFlag(source), ...(type === "Tile" ? { interaction: record(source.flags?.ordemparanormal2)?.tileInteraction } : {}) };
}
export function sceneManagedUpdate(type: SceneEmbeddedType, source: SceneEmbeddedSource): SceneEmbeddedSource {
  const projection = sceneEmbeddedProjection(type, source);
  const { flag, interaction, ...data } = projection;
  return { _id: source._id, ...data, [SCENE_IMPORT_FLAG_PATH]: flag,
    ...(type === "Tile" ? { "flags.ordemparanormal2.tileInteraction": interaction } : {}) };
}
export function sceneFlag(preset: AdventureScenePreset, adventureId: string, baseline?: SceneBaseline): SceneImportFlag {
  return { importer: "scene", adventureId, documentId: preset.id, version: 1, presetId: preset.id,
    presetRevision: preset.revision, act: preset.act, state: "incomplete", ...(baseline ? { baseline } : {}) };
}
export function sceneEmbeddedFlag(type: SceneEmbeddedType, id: string, flag: SceneImportFlag): SceneEmbeddedFlag {
  return { importer: "sceneEmbedded", adventureId: flag.adventureId, documentId: flag.documentId, embeddedType: type, embeddedId: id, version: 1 };
}
export function isManagedSceneEmbedded(source: SceneEmbeddedSource, type: SceneEmbeddedType, flag: SceneImportFlag): boolean {
  const f = importFlag(source);
  return f?.importer === "sceneEmbedded" && f.adventureId === flag.adventureId && f.documentId === flag.documentId
    && f.embeddedType === type && f.embeddedId === source._id && f.version === 1;
}
export function readSceneImportFlag(scene: AdventureSceneSource, adventureId: string): SceneImportFlag | null {
  const raw = record(scene.flags?.ordemparanormal2)?.adventureImport;
  const f = importFlag(scene);
  if (raw === undefined) return null;
  if (!f || f.importer !== "scene") throw new Error("Provenance de Scene incompatível.");
  if (f.adventureId !== adventureId) return null;
  if (f.version !== 1 || typeof f.documentId !== "string" || f.presetId !== f.documentId
    || !Number.isInteger(f.presetRevision) || (f.presetRevision as number) < 1
    || (f.act !== "actOne" && f.act !== "actTwo") || !f.documentId.startsWith(`${f.act}.`)
    || (f.state !== "incomplete" && f.state !== "complete")) throw new Error("Identidade de Scene incompatível.");
  if (f.baseline !== undefined) {
    const b = record(f.baseline);
    if (!b || typeof b.digest !== "string" || !Array.isArray(b.embedded) || !b.embedded.every(v => {
      const e = record(v); return e && typeof e.id === "string" && typeof e.digest === "string" && typeof e.type === "string" && e.type in SCENE_COLLECTIONS;
    }) || new Set(b.embedded.map(v => { const e = record(v)!; return `${e.type}:${e.id}`; })).size !== b.embedded.length) throw new Error("Baseline de Scene incompatível.");
  } else if (f.state === "complete") throw new Error("Baseline de Scene ausente.");
  return f as unknown as SceneImportFlag;
}
export function validateSceneStructure(scene: AdventureSceneSource, flag: SceneImportFlag): void {
  for (const [type, collection] of Object.entries(SCENE_COLLECTIONS)) {
    const sources = scene[collection] as readonly SceneEmbeddedSource[];
    if (!Array.isArray(sources) || new Set(sources.map(s => s._id)).size !== sources.length) throw new Error("IDs embedded de Scene duplicados ou inválidos.");
    for (const source of sources) {
      const raw = record(source.flags?.ordemparanormal2)?.adventureImport;
      if (raw !== undefined && !isManagedSceneEmbedded(source, type as SceneEmbeddedType, flag)) throw new Error("Provenance embedded de Scene incompatível.");
    }
  }
}
export async function buildSceneBaseline(scene: AdventureSceneSource, flag: SceneImportFlag): Promise<SceneBaseline> {
  const embedded: SceneBaseline["embedded"][number][] = [];
  for (const [type, collection] of Object.entries(SCENE_COLLECTIONS)) {
    for (const source of scene[collection] as readonly SceneEmbeddedSource[]) {
      if (isManagedSceneEmbedded(source, type as SceneEmbeddedType, flag)) embedded.push({ type: type as SceneEmbeddedType, id: source._id,
        digest: await managedDigest(sceneEmbeddedProjection(type as SceneEmbeddedType, source)) });
    }
  }
  embedded.sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
  return { digest: await managedDigest(sceneConfigurationProjection(scene)), embedded };
}
export async function hasSceneDivergence(scene: AdventureSceneSource, flag: SceneImportFlag): Promise<boolean> {
  return flag.state !== "complete" || !flag.baseline || stableSerialize(await buildSceneBaseline(scene, flag)) !== stableSerialize(flag.baseline);
}
export function relevantSceneState(scene: AdventureSceneSource, flag: SceneImportFlag): string {
  return stableSerialize({ configuration: sceneConfigurationProjection(scene), flag: importFlag(scene),
    embedded: Object.entries(SCENE_COLLECTIONS).map(([type, collection]) => ({ type,
      sources: (scene[collection] as readonly SceneEmbeddedSource[]).map(source => ({ id: source._id,
        data: isManagedSceneEmbedded(source, type as SceneEmbeddedType, flag) ? sceneEmbeddedProjection(type as SceneEmbeddedType, source) : source,
      })).sort((a, b) => a.id.localeCompare(b.id)) })) });
}
export function planSceneEmbeddedChanges(current: AdventureSceneSource | null, desired: AdventureSceneSource, flag: SceneImportFlag): readonly SceneEmbeddedChange[] {
  return Object.entries(SCENE_COLLECTIONS).map(([typeName, collection]) => {
    const type = typeName as SceneEmbeddedType;
    const existing = new Map(((current?.[collection] ?? []) as readonly SceneEmbeddedSource[]).map(s => [s._id, s]));
    const targets = desired[collection] as readonly SceneEmbeddedSource[];
    for (const target of targets) {
      const source = existing.get(target._id);
      if (source && !isManagedSceneEmbedded(source, type, flag)) throw new Error(`Colisão com ${type} manual: ${target._id}`);
    }
    return { type, creates: targets.filter(s => !existing.has(s._id)),
      updates: targets.filter(s => existing.has(s._id) && stableSerialize(sceneEmbeddedProjection(type, existing.get(s._id)!)) !== stableSerialize(sceneEmbeddedProjection(type, s))),
      deletes: [...existing.values()].filter(s => isManagedSceneEmbedded(s, type, flag) && !targets.some(t => t._id === s._id)).map(s => s._id) };
  });
}
export function validateManualSceneDependencies(current: AdventureSceneSource | null, changes: readonly SceneEmbeddedChange[], flag: SceneImportFlag): void {
  if (!current) return;
  const removed = (type: SceneEmbeddedType) => new Set(changes.find(c => c.type === type)?.deletes ?? []);
  const walls = removed("Wall"), tiles = removed("Tile"), levels = removed("Level");
  for (const [type, collection] of Object.entries(SCENE_COLLECTIONS)) {
    for (const source of current[collection] as readonly SceneEmbeddedSource[]) {
      if (isManagedSceneEmbedded(source, type as SceneEmbeddedType, flag)) continue;
      const refs = record(record(source.flags?.ordemparanormal2)?.tileInteraction);
      if (Array.isArray(refs?.wallIds) && refs.wallIds.some(id => walls.has(id))
        || Array.isArray(refs?.tileIds) && refs.tileIds.some(id => tiles.has(id))) throw new Error("Remoção gerenciada afetaria uma interação manual.");
      if (levels.has(String(source.level)) || Array.isArray(source.levels) && source.levels.some(id => levels.has(id))) throw new Error("Remoção de Level afetaria conteúdo manual.");
    }
  }
  for (const collection of ["lights", "sounds", "notes", "regions", "templates"]) {
    const sources = current[collection];
    if (Array.isArray(sources) && sources.some(source => levels.has(String(source.level)) || Array.isArray(source.levels) && source.levels.some((id: unknown) => levels.has(String(id))))) throw new Error("Remoção de Level afetaria conteúdo manual.");
  }
}
