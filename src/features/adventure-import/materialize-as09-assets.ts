import { sha256Hex } from "../../adapters/files/compute-sha256";
import { openZipArchive } from "../../adapters/files/open-zip-archive";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import { validateZipReaderInventory } from "../../adapters/files/read-zip-content-facts";
import type { As09ToolImagePort } from "../../adapters/files/as09-tool-image";
import type { AdventureAssetStorage } from "../../adapters/foundry/adventure-asset-storage";
import { AS09_IMAGES, AS09_POI_IMAGES } from "../../config/adventure-definitions/playtest-alpha-as09";
import { safeZipEntryPath, assertDistinctZipPaths } from "../../core/adventure-import/safe-zip-entry-path";
import { buildStructuralZipPayload } from "../../core/adventure-import/zip-structural-manifest";
import { analyzeAs09Source, selectAs09ImagePayload } from "./analyze-as09-source";
import { adventureAs09Root } from "./adventure-asset-layout";

export interface As09MaterializedAsset {
  readonly basename: string;
  readonly sourcePath: string;
  readonly storedPath: string;
}
export interface As09MaterializationResult {
  readonly directory: string;
  readonly assets: readonly As09MaterializedAsset[];
}
export class As09MaterializationError extends Error {
  constructor(readonly stage: "preflight" | "directory" | "extract" | "convert" | "lookup" | "upload",
    readonly asset: string | null, readonly confirmedAssets: readonly As09MaterializedAsset[], cause: unknown) {
    super(cause instanceof Error ? cause.message : "Falha ao materializar AS09.", { cause });
    this.name = "As09MaterializationError";
  }
}

export async function materializeAs09Assets(input: {
  readonly file: File;
  readonly storage: AdventureAssetStorage;
  readonly images: As09ToolImagePort;
  readonly isAuthorized: () => boolean;
  readonly onProgress?: (completed: number, total: number) => void | Promise<void>;
}): Promise<As09MaterializationResult> {
  const confirmed: As09MaterializedAsset[] = [];
  let stage: As09MaterializationError["stage"] = "preflight", asset: string | null = null;
  function guard() { if (!input.isAuthorized()) throw new Error("As fontes ou o GM ativo mudaram. Execute novamente."); }
  try {
    guard();
    const analysis = await analyzeAs09Source(input.file);
    if (analysis.status !== "recognized") throw new Error("O ZIP AS09 não é mais reconhecido.");
    const { entries, issues } = await readZipCentralDirectory(input.file);
    if (issues.some(issue => issue.severity === "error")) throw new Error("Inventário AS09 inválido.");
    const payload = selectAs09ImagePayload(buildStructuralZipPayload(entries));
    assertDistinctZipPaths(AS09_IMAGES.map(image => safeZipEntryPath(image.outputBasename)));
    const directory = adventureAs09Root(input.storage.worldId);
    const archive = await openZipArchive(input.file);
    try {
      validateZipReaderInventory(archive, entries);
      const byPath = new Map(archive.entries.map(entry => [safeZipEntryPath(entry.path).relativePath, entry]));
      guard();
      stage = "directory";
      await input.storage.ensureDirectories([directory]);
      await input.onProgress?.(0, AS09_IMAGES.length);
      for (const image of AS09_IMAGES) {
        guard(); asset = image.basename; stage = "extract";
        const original = payload.find(entry => entry.path === image.path)!;
        const entry = byPath.get(safeZipEntryPath(original.originalPath).relativePath)!;
        const blob = await entry.extract();
        if (blob.size !== image.uncompressedSize || await sha256Hex(await blob.arrayBuffer()) !== image.contentSha256)
          throw new Error(`Conteúdo AS09 incompatível: ${image.basename}.`);
        stage = "lookup";
        let path = await input.storage.findExisting(directory, image.outputBasename);
        if (path && image.convertTiff && !await input.images.inspect(path)) path = null;
        if (!path) {
          stage = image.convertTiff ? "convert" : "upload";
          const output = image.convertTiff ? await input.images.convert(blob) : blob;
          guard(); stage = "upload";
          path = await input.storage.uploadAndConfirm(directory,
            new File([output], image.outputBasename, { type: image.outputBasename.endsWith(".jpg") ? "image/jpeg" : "image/png" }));
          if (image.convertTiff && !await input.images.inspect(path)) throw new Error(`PNG da ferramenta não confirmado: ${image.basename}.`);
        }
        confirmed.push({ basename: image.basename, sourcePath: image.path, storedPath: path });
        await input.onProgress?.(confirmed.length, AS09_IMAGES.length);
      }
      guard();
      return { directory, assets: confirmed };
    } finally { await archive.close(); }
  } catch (cause) { throw new As09MaterializationError(stage, asset, [...confirmed], cause); }
}

export function as09PoiImages(result: As09MaterializationResult): ReadonlyMap<string, string> {
  if (result.assets.length !== AS09_IMAGES.length || AS09_IMAGES.some(image =>
    result.assets.filter(asset => asset.basename === image.basename && asset.sourcePath === image.path && asset.storedPath).length !== 1))
    throw new Error("Materialização AS09 incompleta.");
  return new Map(Object.entries(AS09_POI_IMAGES).map(([id, basename]) =>
    [id, result.assets.find(asset => asset.basename === basename)!.storedPath]));
}
