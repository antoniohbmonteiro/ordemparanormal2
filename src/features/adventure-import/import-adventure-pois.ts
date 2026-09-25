import { managedDigest, stableSerialize } from "../../core/adventure-import/adventure-agent-reconciliation";
import { poiSystem, validateAdventurePoiReferences, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";
import type { AdventureDefinition } from "../../core/adventure-import/adventure-definition";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import type { PointOfInterestSystemData } from "../../documents/item/point-of-interest-data";
import { resolveAdventureAsset, type AdventureAssetResolutionSource } from "./resolve-adventure-asset";
import { adventureFolderPlacementFlag, ensureAdventurePoiFolder, hasAdventureFolderPlacement,
  type AdventureFolderPlacementFlag, type AdventureFolderPort } from "./adventure-folders";

export const ADVENTURE_POI_FLAG_PATH = "flags.ordemparanormal2.adventureImport";
export const ADVENTURE_POI_FALLBACK_IMAGE = "icons/svg/item-bag.svg";
export type PoiConflictDecision = "preserve" | "restore" | null;
export interface PoiImportFlag {
  readonly importer: "pointOfInterest";
  readonly adventureId: string;
  readonly documentId: string;
  readonly act: AdventureAct;
  readonly version: 1;
  readonly presetRevision: number;
  readonly state: "incomplete" | "complete";
  readonly baseline?: string;
}
export interface PoiItemSnapshot {
  readonly id: string;
  readonly type: string;
  readonly folderId: string | null;
  readonly img: string | null;
  readonly flag: unknown;
  readonly folderPlacement: unknown;
  readonly system: PointOfInterestSystemData;
}
export interface PoiItemPort {
  isAuthorized(): boolean;
  listItems(): readonly PoiItemSnapshot[];
  validateCandidate(preset: AdventurePoiPreset, flag: PoiImportFlag): void;
  createItem(preset: AdventurePoiPreset, img: string, folderId: string, flag: PoiImportFlag,
    placement: AdventureFolderPlacementFlag): Promise<string>;
  updateFolderPlacement(id: string, folderId: string | null, flag: AdventureFolderPlacementFlag): Promise<void>;
  updateImageIfFallback(id: string, img: string): Promise<boolean>;
  updateItem(id: string, system: PointOfInterestSystemData, flag: PoiImportFlag): Promise<void>;
  completeItem(id: string, flag: PoiImportFlag): Promise<void>;
}
export interface PreparedAdventurePoi {
  readonly preset: AdventurePoiPreset;
  readonly itemId: string | null;
  readonly divergent: boolean;
}
export interface PoiImportCounts {
  created: number; updated: number; unchanged: number;
  preserved: number; cancelled: boolean;
}
export class PoiImportError extends Error {
  constructor(readonly stage: "preflight" | "confirmation" | "folder" | "item" | "baseline",
    readonly presetId: string | null, readonly counts: PoiImportCounts, message: string, options?: ErrorOptions) {
    super(message, options); this.name = "PoiImportError";
  }
}
export interface ImportAdventurePoisInput {
  readonly definition: AdventureDefinition;
  readonly presets: readonly unknown[];
  readonly revision: number;
  readonly acts: readonly AdventureAct[];
  readonly items: PoiItemPort;
  readonly folders: AdventureFolderPort;
  readonly assetSource: AdventureAssetResolutionSource;
  readonly decide: (pois: readonly PreparedAdventurePoi[]) => Promise<PoiConflictDecision>;
  readonly onProgress?: (completed: number, total: number) => void | Promise<void>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function readFlag(value: unknown, adventureId: string): PoiImportFlag | null {
  const flag = record(value);
  if (!flag || flag.importer !== "pointOfInterest") return null;
  if (typeof flag.adventureId !== "string") throw new Error("Provenance de POI sem aventura.");
  if (flag.adventureId !== adventureId) return null;
  if (flag.version !== 1 || typeof flag.documentId !== "string" || !flag.documentId.startsWith(`${flag.act}.`)
    || (flag.act !== "actOne" && flag.act !== "actTwo") || !Number.isInteger(flag.presetRevision)
    || (flag.presetRevision as number) < 1 || (flag.state !== "incomplete" && flag.state !== "complete")
    || (flag.state === "complete" && typeof flag.baseline !== "string")) {
    throw new Error(`Provenance de POI incompatível: ${flag.documentId}.`);
  }
  return flag as unknown as PoiImportFlag;
}
/**
 * Digest of the managed `system`. Baselines recorded before information availability existed carry no
 * availability, and the DataModel now fills "always" into that same stored source; omitting the default keeps
 * those baselines valid, so untouched Items are not reported as manual edits.
 */
export function managedPoiDigest(system: PointOfInterestSystemData): Promise<string> {
  const information: unknown = system.information;
  return managedDigest(Array.isArray(information)
    ? { ...system, information: information.map(omitDefaultAvailability) } : system);
}
function omitDefaultAvailability(entry: unknown): unknown {
  const value = record(entry);
  const availability = record(value?.availability);
  if (!value || availability?.mode !== "always" || availability.condition !== "") return entry;
  const { availability: _default, ...rest } = value;
  return rest;
}
function relevantState(item: PoiItemSnapshot): string {
  return stableSerialize({ type: item.type, flag: item.flag, system: item.system,
    folderId: item.folderId, folderPlacement: item.folderPlacement });
}
function flagFor(definition: AdventureDefinition, preset: AdventurePoiPreset, revision: number): PoiImportFlag {
  return { importer: "pointOfInterest", adventureId: definition.id, documentId: preset.id,
    act: preset.act, version: 1, presetRevision: revision, state: "incomplete" };
}
function placementFor(definition: AdventureDefinition, preset: AdventurePoiPreset): AdventureFolderPlacementFlag {
  return { ...legacyPlacementFor(definition, preset), folderId: "pointsOfInterest" };
}
function legacyPlacementFor(definition: AdventureDefinition, preset: AdventurePoiPreset): AdventureFolderPlacementFlag {
  return adventureFolderPlacementFlag({ adventureId: definition.id, documentType: "Item", documentId: preset.id, act: preset.act });
}
let importing = false;
export async function importAdventurePois(input: ImportAdventurePoisInput): Promise<PoiImportCounts> {
  const counts: PoiImportCounts = { created: 0, updated: 0, unchanged: 0, preserved: 0, cancelled: false };
  if (importing) throw new PoiImportError("preflight", null, counts, "Já existe uma importação de POIs em andamento.");
  importing = true;
  let stage: PoiImportError["stage"] = "preflight", presetId: string | null = null;
  try {
    if (!input.items.isAuthorized()) throw new Error("Somente o GM ativo pode importar POIs.");
    if (!Number.isInteger(input.revision) || input.revision < 1 || !input.acts.length
      || new Set(input.acts).size !== input.acts.length
      || input.acts.some(act => act !== "actOne" && act !== "actTwo")) throw new Error("Escopo ou revisão de POI inválidos.");
    validateAdventurePoiReferences(input.definition, input.presets, input.acts);
    const catalog = input.presets as readonly AdventurePoiPreset[];
    for (const preset of catalog) input.items.validateCandidate(preset, flagFor(input.definition, preset, input.revision));
    const selected = input.definition.pointsOfInterest.map(ref => catalog.find(p => p.id === ref.presetId)!)
      .filter(p => input.acts.includes(p.act));
    const images = new Map<string, string>();
    for (const preset of selected) {
      if (preset.imageAssetId) images.set(preset.id, await resolveAdventureAsset(input.definition, preset.imageAssetId,
        input.assetSource));
    }
    const selectedIds = new Set(selected.map(p => p.id));
    const existing = new Map<string, PoiItemSnapshot>();
    for (const item of input.items.listItems()) {
      const flag = readFlag(item.flag, input.definition.id);
      if (!flag || !selectedIds.has(flag.documentId)) continue;
      if (item.type !== "pointOfInterest" || existing.has(flag.documentId)) throw new Error(`Identidade de POI duplicada ou incompatível: ${flag.documentId}.`);
      hasAdventureFolderPlacement(item.folderPlacement, placementFor(input.definition, selected.find(p => p.id === flag.documentId)!));
      existing.set(flag.documentId, item);
    }
    const prepared: Array<PreparedAdventurePoi & { previousState: string | null; flag: PoiImportFlag; desiredDigest: string }> = [];
    for (const preset of selected) {
      const item = existing.get(preset.id);
      const flag = flagFor(input.definition, preset, input.revision);
      const desiredDigest = await managedPoiDigest(poiSystem(preset));
      const previous = item ? readFlag(item.flag, input.definition.id)! : null;
      prepared.push({ preset, itemId: item?.id ?? null, previousState: item ? relevantState(item) : null, flag,
        desiredDigest, divergent: !!item && (previous?.state !== "complete" || await managedPoiDigest(item.system) !== previous.baseline) });
    }
    stage = "confirmation";
    const divergent = prepared.filter(p => p.divergent);
    const decision = divergent.length ? await input.decide(divergent) : "restore";
    if (decision === null) return { ...counts, cancelled: true };
    if (!input.items.isAuthorized()) throw new Error("O GM ativo mudou. Execute novamente.");
    const folders = new Map<AdventureAct, { readonly actId: string; readonly poiId: string }>();
    for (const act of new Set(prepared.map(p => p.preset.act))) {
      stage = "folder";
      folders.set(act, await ensureAdventurePoiFolder({ adventureId: input.definition.id, act, folders: input.folders }));
    }
    await input.onProgress?.(0, prepared.length);
    for (const plan of prepared) {
      presetId = plan.preset.id;
      if (!input.items.isAuthorized()) throw new Error("O GM ativo mudou. Execute novamente.");
      const matches = input.items.listItems().filter(item => readFlag(item.flag, input.definition.id)?.documentId === presetId);
      const previous = matches[0];
      if (plan.itemId ? matches.length !== 1 || previous.id !== plan.itemId || relevantState(previous) !== plan.previousState : matches.length !== 0) {
        throw new Error("Um POI mudou após a preparação. Execute novamente.");
      }
      const placement = placementFor(input.definition, plan.preset);
      if (previous && !hasAdventureFolderPlacement(previous.folderPlacement, placement)) {
        stage = "folder";
        const isLegacy = hasAdventureFolderPlacement(previous.folderPlacement, legacyPlacementFor(input.definition, plan.preset));
        const target = isLegacy && previous.folderId === folders.get(plan.preset.act)!.actId
          ? folders.get(plan.preset.act)!.poiId : previous.folderId;
        await input.items.updateFolderPlacement(previous.id, target, placement);
      }
      const image = images.get(plan.preset.id);
      let imageUpdated = false;
      if (previous && image) {
        stage = "item";
        imageUpdated = await input.items.updateImageIfFallback(previous.id, image);
      }
      if (plan.divergent && decision === "preserve") counts.preserved++;
      else if (previous && !plan.divergent && await managedPoiDigest(previous.system) === plan.desiredDigest
        && readFlag(previous.flag, input.definition.id)?.presetRevision === input.revision) {
        if (imageUpdated) counts.updated++; else counts.unchanged++;
      }
      else {
        stage = "item";
        const id = plan.itemId ?? await input.items.createItem(plan.preset,
          image ?? ADVENTURE_POI_FALLBACK_IMAGE, folders.get(plan.preset.act)!.poiId, plan.flag, placement);
        if (plan.itemId) await input.items.updateItem(id, poiSystem(plan.preset), plan.flag);
        const persisted = input.items.listItems().find(item => item.id === id);
        if (!persisted || await managedPoiDigest(persisted.system) !== plan.desiredDigest
          || stableSerialize(readFlag(persisted.flag, input.definition.id)) !== stableSerialize(plan.flag)) {
          throw new Error(`Dados persistidos do POI não confirmados: ${presetId}.`);
        }
        stage = "baseline";
        await input.items.completeItem(id, { ...plan.flag, state: "complete", baseline: await managedPoiDigest(persisted.system) });
        const complete = input.items.listItems().find(item => item.id === id);
        if (!complete || readFlag(complete.flag, input.definition.id)?.state !== "complete") throw new Error(`Baseline de POI não confirmado: ${presetId}.`);
        if (plan.itemId) counts.updated++; else counts.created++;
      }
      await input.onProgress?.(counts.created + counts.updated + counts.unchanged + counts.preserved, prepared.length);
    }
    return counts;
  } catch (cause) {
    throw new PoiImportError(stage, presetId, { ...counts }, cause instanceof Error ? cause.message : "Falha na importação de POIs.", { cause });
  } finally { importing = false; }
}
