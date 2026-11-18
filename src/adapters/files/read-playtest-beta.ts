
import { BETA_MISSION_DATA, BETA_PDF_HASH, type BetaMissionId } from "../../config/adventure-definitions/playtest-beta";
import { safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";
import { sha256Hex } from "./compute-sha256";
import { openZipArchive, type ExtractableZipEntry } from "./open-zip-archive";
import { loadPdfJs } from "./pdfjs-document";
import type { AdventurePdfTextPage } from "./read-adventure-poi-pages";

export async function betaBlobHash(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer());
}

export async function readBetaPages(file: Blob, pageCount: number, numbers: readonly number[],
  pdfJs?: Awaited<ReturnType<typeof loadPdfJs>>): Promise<ReadonlyMap<number, AdventurePdfTextPage>> {
  const library = pdfJs ?? await loadPdfJs();
  const task = library.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await task.promise;
    if (document.numPages !== pageCount) throw new Error("Número de páginas inesperado no PDF Beta.");
    const result = new Map<number, AdventurePdfTextPage>();
    for (const number of numbers) {
      const content = await (await document.getPage(number)).getTextContent();
      result.set(number, { number, items: content.items.flatMap((item, order) => "str" in item && item.str.trim()
        ? [{ text: item.str, x: item.transform[4], y: item.transform[5], height: item.height, order }] : []) });
    }
    return result;
  } finally {
    await task.destroy();
  }
}

export async function assertBetaPdf(file: Blob): Promise<void> {
  if (file.size !== 41282185 || await betaBlobHash(file) !== BETA_PDF_HASH)
    throw new Error("O PDF principal não corresponde ao Playtest Beta v1.0 das Missões 1 e 2.");
}

export async function withBetaArchive<T>(mission: BetaMissionId, file: File,
  use: (read: (path: string) => Promise<Blob>, paths: readonly string[]) => Promise<T>): Promise<T> {
  const definition = BETA_MISSION_DATA[mission];
  const expected: Readonly<Record<string, readonly (string | number)[]>> = definition.entries;
  const archive = await openZipArchive(file);
  try {
    const paths = new Set<string>();
    const entries = new Map<string, ExtractableZipEntry>();
    for (const entry of archive.entries) {
      const safe = safeZipEntryPath(entry.path);
      const path = safe.relativePath.normalize("NFC");
      const identity = path.toLocaleLowerCase("pt-BR");
      if (paths.has(identity) || entry.symlink || entry.directory !== safe.isDirectory
        || path !== definition.root && !path.startsWith(definition.root + "/"))
        throw new Error("Entrada inválida nos extras de " + definition.name + ": " + entry.path);
      paths.add(identity);
      if (!entry.directory) entries.set(path.slice(definition.root.length + 1), entry);
    }
    const registered = Object.keys(expected);
    if (entries.size !== registered.length || registered.some(path => entries.get(path)?.uncompressedSize !== expected[path][0]))
      throw new Error("O ZIP não corresponde aos extras de " + definition.name + ".");
    return await use(async path => {
      const entry = entries.get(path);
      if (!entry) throw new Error("Arquivo obrigatório ausente: " + path);
      const blob = await entry.extract();
      if (blob.size !== expected[path][0] || await betaBlobHash(blob) !== expected[path][1])
        throw new Error("Arquivo divergente nos extras de " + definition.name + ": " + path);
      return blob;
    }, registered);
  } finally {
    await archive.close();
  }
}
