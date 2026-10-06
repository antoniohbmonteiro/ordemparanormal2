import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { createHash } from "node:crypto";
import type { As09ImageSource } from "../../config/adventure-definitions/playtest-alpha-as09";

export function syntheticImages(images: readonly As09ImageSource[]): readonly As09ImageSource[] {
  return images.map((image, i) => ({ ...image, uncompressedSize: 4,
    crc32: syntheticCrc32(syntheticImageBytes(i)),
    contentSha256: createHash("sha256").update(syntheticImageBytes(i)).digest("hex"),
  }));
}

export function syntheticImageBytes(index: number): Uint8Array<ArrayBuffer> { return Uint8Array.of(index + 1, 45, 67, 89); }
export function syntheticCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export async function syntheticAs09File(noise = false): Promise<File> {
  const { AS09_IMAGES } = await import("../../config/adventure-definitions/playtest-alpha-as09");
  const writer = new ZipWriter(new BlobWriter());
  for (const [index, image] of AS09_IMAGES.entries()) await writer.add(image.path, new BlobReader(new Blob([syntheticImageBytes(index)])), { level: 0 });
  await writer.add("Presentinho-imagens-AS08-pedidas-pelos-elites/KIT DE ARROMBAMENTO.psd", new BlobReader(new Blob(["source"])), { level: 0 });
  for (let i = 0; i < 48; i++) await writer.add(`ignored-${i}.bin`, new BlobReader(new Blob(["unused"])), { level: 0 });
  if (noise) await writer.add("__MACOSX/._pack", new BlobReader(new Blob(["noise"])), { level: 0 });
  return new File([await writer.close()], "AS09-Extras-v1.0-Elite (1).zip");
}
