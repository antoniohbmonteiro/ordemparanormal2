import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

export interface ExtractableZipEntry {
  readonly path: string;
  readonly directory: boolean;
  readonly symlink: boolean;
  readonly uncompressedSize: number;
  readonly crc32: number | undefined;
  extract(): Promise<Blob>;
}

export interface OpenZipArchive {
  readonly entries: readonly ExtractableZipEntry[];
  close(): Promise<void>;
}

export async function openZipArchive(file: File): Promise<OpenZipArchive> {
  const reader = new ZipReader(new BlobReader(file), { strictness: "strict", checkCrc32: true });
  try {
    const entries = await reader.getEntries({ filenameValidation: "strict" });
    return {
      entries: entries.map((entry): ExtractableZipEntry => ({
        path: entry.filename,
        directory: entry.directory,
        symlink: entry.symlink,
        uncompressedSize: entry.uncompressedSize,
        crc32: entry.crc32,
        extract: async () => {
          if (entry.directory) throw new Error(`Cannot extract directory: ${entry.filename}`);
          return entry.getData(new BlobWriter(), { checkCrc32: true });
        },
      })),
      close: () => reader.close(),
    };
  } catch (error) {
    await reader.close();
    throw error;
  }
}
