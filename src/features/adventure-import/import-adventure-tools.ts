import { AS09_TOOLS } from "../../config/adventure-definitions/playtest-alpha-as09";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import { stableSerialize } from "../../core/adventure-import/adventure-agent-reconciliation";
import { as09PoiImages, type As09MaterializationResult } from "./materialize-as09-assets";
import { adventureFolderPlacementFlag, ensureAdventureToolsFolder, type AdventureFolderPlacementFlag, type AdventureFolderPort } from "./adventure-folders";

export const ADVENTURE_TOOL_FALLBACK_IMAGE = "icons/svg/item-bag.svg";
export interface ToolImportFlag {
  readonly importer: "equipment";
  readonly version: 1;
  readonly adventureId: "playtest-alpha";
  readonly act: "actTwo";
  readonly documentId: string;
  readonly sourceUuid: string;
  readonly state: "incomplete" | "complete";
}
export interface ToolItemSnapshot {
  readonly id: string;
  readonly type: string;
  readonly sourceUuid: string | null;
  readonly img: string | null;
  readonly flag: unknown;
}
export interface AdventureToolItemPort {
  isAuthorized(): boolean;
  listItems(): readonly ToolItemSnapshot[];
  prepareCanonical(sourceUuid: string, sourceId: string, img: string): Promise<void>;
  createItem(flag: ToolImportFlag, img: string, folderId: string, placement: AdventureFolderPlacementFlag): Promise<string>;
  updateImageIfFallback(id: string, img: string): Promise<boolean>;
  completeItem(id: string, flag: ToolImportFlag): Promise<void>;
}
export interface ToolImportCounts { created: number; updated: number; unchanged: number }
export class ToolImportError extends Error {
  constructor(readonly stage: "preflight" | "folder" | "item", readonly counts: ToolImportCounts, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Falha ao importar ferramentas.", { cause });
    this.name = "ToolImportError";
  }
}

function readFlag(value: unknown): ToolImportFlag | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const flag = value as Partial<ToolImportFlag>;
  if (flag.importer !== "equipment") return null;
  if (typeof flag.adventureId !== "string") throw new Error("Provenance de ferramenta sem aventura.");
  if (flag.adventureId !== "playtest-alpha") return null;
  const tool = AS09_TOOLS.find(tool => tool.documentId === flag.documentId);
  if (!tool || flag.version !== 1 || flag.act !== "actTwo" || flag.sourceUuid !== tool.sourceUuid
    || (flag.state !== "incomplete" && flag.state !== "complete")) throw new Error("Provenance de ferramenta incompatível.");
  return flag as ToolImportFlag;
}
function existingItems(items: AdventureToolItemPort): Map<string, ToolItemSnapshot> {
  const result = new Map<string, ToolItemSnapshot>();
  for (const item of items.listItems()) {
    const flag = readFlag(item.flag);
    if (!flag) continue;
    if (item.type !== "equipment" || item.sourceUuid !== flag.sourceUuid || result.has(flag.documentId))
      throw new Error(`Identidade de ferramenta duplicada ou incompatível: ${flag.documentId}.`);
    result.set(flag.documentId, item);
  }
  return result;
}
let importing = false;
export async function importAdventureTools(input: {
  readonly acts: readonly AdventureAct[];
  readonly materialization: As09MaterializationResult;
  readonly items: AdventureToolItemPort;
  readonly folders: AdventureFolderPort;
  readonly onProgress?: (completed: number, total: number) => void | Promise<void>;
}): Promise<ToolImportCounts> {
  const counts: ToolImportCounts = { created: 0, updated: 0, unchanged: 0 };
  if (!input.acts.includes("actTwo")) return counts;
  if (importing) throw new ToolImportError("preflight", counts, new Error("Já existe uma importação de ferramentas em andamento."));
  importing = true;
  let stage: ToolImportError["stage"] = "preflight";
  function guard() { if (!input.items.isAuthorized()) throw new Error("Somente o GM ativo pode importar ferramentas."); }
  try {
    guard(); as09PoiImages(input.materialization);
    const existing = existingItems(input.items);
    const prepared = [];
    for (const tool of AS09_TOOLS) {
      const image = input.materialization.assets.find(asset => asset.basename === tool.basename)!.storedPath;
      await input.items.prepareCanonical(tool.sourceUuid, tool.sourceId, image);
      prepared.push({ tool, image, previous: structuredClone(existing.get(tool.documentId)) });
    }
    guard(); stage = "folder";
    const folderId = await ensureAdventureToolsFolder({ adventureId: "playtest-alpha", folders: input.folders });
    await input.onProgress?.(0, prepared.length);
    for (const { tool, image, previous } of prepared) {
      guard(); stage = "item";
      const current = existingItems(input.items).get(tool.documentId);
      if (stableSerialize(current ?? null) !== stableSerialize(previous ?? null)) throw new Error("Uma ferramenta mudou após a preparação. Execute novamente.");
      const flag: ToolImportFlag = { importer: "equipment", version: 1, adventureId: "playtest-alpha", act: "actTwo",
        documentId: tool.documentId, sourceUuid: tool.sourceUuid, state: "incomplete" };
      const placement = adventureFolderPlacementFlag({ adventureId: flag.adventureId, documentType: "Item",
        documentId: flag.documentId, act: "actTwo", folderId: "tools" });
      const id = current?.id ?? await input.items.createItem(flag, image, folderId, placement);
      const imageUpdated = current ? await input.items.updateImageIfFallback(id, image) : false;
      const incomplete = !current || readFlag(current.flag)?.state !== "complete";
      if (incomplete) await input.items.completeItem(id, { ...flag, state: "complete" });
      const persisted = existingItems(input.items).get(tool.documentId);
      if (persisted?.id !== id || readFlag(persisted.flag)?.state !== "complete") throw new Error("Ferramenta persistida não confirmada.");
      if (!current) counts.created++; else if (imageUpdated || incomplete) counts.updated++; else counts.unchanged++;
      await input.onProgress?.(counts.created + counts.updated + counts.unchanged, prepared.length);
    }
    return counts;
  } catch (cause) { throw new ToolImportError(stage, { ...counts }, cause); }
  finally { importing = false; }
}
