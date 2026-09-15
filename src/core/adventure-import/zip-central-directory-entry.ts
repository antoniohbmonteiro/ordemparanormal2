export interface ZipCentralDirectoryEntry {
  readonly path: string;
  readonly uncompressedSize: number;
  readonly crc32: number;
}

export function isZipDirectoryEntry(path: string): boolean {
  return path.replace(/\\/g, "/").endsWith("/");
}
