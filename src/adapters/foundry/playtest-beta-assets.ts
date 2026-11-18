import { safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";

import { betaBlobHash, withBetaArchive } from "../files/read-playtest-beta";
import { createAdventureAssetStorage } from "./adventure-asset-storage";
import { BETA_ID, BETA_MISSION_DATA } from "../../config/adventure-definitions/playtest-beta";
import type { PreparedBetaMission } from "../../features/adventure-import/prepare-playtest-beta";

const types: Readonly<Record<string, string>> = {
  jpg: "image/jpeg", png: "image/png", pdf: "application/pdf", mp3: "audio/mpeg",
};

async function derivedImage(blob: Blob, maxSize: number, type: string) {
  const bitmap = await createImageBitmap(blob);
  try {
    if (maxSize === 4096 && (bitmap.width !== 9930 || bitmap.height !== 8280)) throw new Error("Dimensões de mapa inesperadas.");
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return blob;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D indisponível.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => {
      if (result?.type === type) resolve(result);
      else reject(new Error("Falha ao gerar versão reduzida do asset."));
    }, type, 0.91));
  } finally { bitmap.close(); }
}

export async function materializeBetaAssets(missions: readonly PreparedBetaMission[], guard: () => void,
  progress: (label: string) => Promise<void>) {
  const storage = createAdventureAssetStorage();
  const world = safeZipEntryPath(storage.worldId);
  if (world.directory || world.isDirectory) throw new Error("Identificador do mundo inválido.");
  const root = "worlds/" + world.relativePath + "/ordemparanormal2/adventures/" + BETA_ID;
  const utils = foundry.utils as typeof foundry.utils & { fetchResource(src: string): Promise<Blob> };
  const paths = new Map<string, string>();
  const uploaded = new Map<string, string>();

  async function store(blob: Blob, ext: string, scope: string): Promise<string> {
    const hash = await betaBlobHash(blob);
    const directory = root + "/" + scope;
    const basename = hash + "." + ext;
    const identity = directory + "/" + basename;
    if (uploaded.has(identity)) return uploaded.get(identity)!;
    guard();
    await storage.ensureDirectories([directory]);
    guard();
    const path = await storage.findExisting(directory, basename)
      ?? await storage.uploadAndConfirm(directory, new File([blob], basename, { type: types[ext] }));
    const stored = await utils.fetchResource(path);
    if (await betaBlobHash(stored) !== hash) throw new Error("Arquivo armazenado divergente: " + path);
    uploaded.set(identity, path);
    return path;
  }

  for (const mission of missions) {
    await withBetaArchive(mission.mission, mission.file, async (read, entries) => {
      for (const path of entries) {
        guard();
        await progress("Verificando e gravando " + path.split("/").at(-1) + "…");
        const blob = await read(path);
        const ext = path.split(".").at(-1)!.toLowerCase();
        const shared = path.startsWith("Músicas/") || path.startsWith("Tokens/Personagem -")
          && !/ - (Sorcha|Cormac)\.png$/u.test(path);
        const scope = shared ? "shared" : mission.mission;
        const original = await store(blob, ext, scope + "/originals");
        const limit = path.startsWith("Mapas/") ? 4096 : path.startsWith("Tokens/") ? 1024 : undefined;
        const rendered = limit ? await derivedImage(blob, limit, types[ext]) : blob;
        const output = rendered === blob ? original : await store(rendered, ext, scope + "/display");
        paths.set(mission.mission + ":" + path, output);
      }
    });
  }
  return (mission: keyof typeof BETA_MISSION_DATA, path: string) => {
    const stored = paths.get(mission + ":" + path);
    if (!stored) throw new Error("Asset Beta indisponível: " + path);
    return stored;
  };
}
