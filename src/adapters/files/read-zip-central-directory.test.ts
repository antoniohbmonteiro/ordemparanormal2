import { describe, expect, it } from "vitest";

import { readZipCentralDirectory } from "./read-zip-central-directory";

interface SyntheticEntry {
  readonly path: string;
  readonly size: number;
  readonly crc32: number;
  readonly utf8?: boolean;
  readonly encrypted?: boolean;
  readonly unixMode?: number;
}

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function encodeName(entry: SyntheticEntry): number[] {
  return entry.utf8 === false
    ? [...entry.path].map((char) => char.charCodeAt(0) & 0xff)
    : [...new TextEncoder().encode(entry.path)];
}

function buildCentralDirectoryRecord(entry: SyntheticEntry): number[] {
  const nameBytes = encodeName(entry);
  let generalPurposeFlag = entry.utf8 === false ? 0 : 0x0800;
  if (entry.encrypted) generalPurposeFlag |= 0x0001;

  return [
    ...u32(0x02014b50),
    ...u16(20),
    ...u16(20),
    ...u16(generalPurposeFlag),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u32(entry.crc32),
    ...u32(entry.size),
    ...u32(entry.size),
    ...u16(nameBytes.length),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u32(entry.unixMode ? entry.unixMode * 0x10000 : 0),
    ...u32(0),
    ...nameBytes,
  ];
}

function buildEocd(entryCount: number, cdSize: number, cdOffset: number): number[] {
  return [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entryCount), ...u16(entryCount), ...u32(cdSize), ...u32(cdOffset), ...u16(0)];
}

function buildSyntheticZipFile(entries: readonly SyntheticEntry[]): File {
  const cdBytes = entries.flatMap((entry) => buildCentralDirectoryRecord(entry));
  const eocdBytes = buildEocd(entries.length, cdBytes.length, 0);
  return new File([new Uint8Array([...cdBytes, ...eocdBytes])], "test.zip");
}

describe("readZipCentralDirectory", () => {
  it("parses UTF-8 entry names, sizes, and CRC-32 from the central directory", async () => {
    const file = buildSyntheticZipFile([
      { path: "Tokens/Personagem - Kênia.png", size: 1234, crc32: 0xdeadbeef },
      { path: "Handouts/Handout 01.jpg", size: 5678, crc32: 0x12345678 },
    ]);
    const { entries, issues } = await readZipCentralDirectory(file);
    expect(issues).toEqual([]);
    expect(entries).toEqual([
      { path: "Tokens/Personagem - Kênia.png", uncompressedSize: 1234, crc32: 0xdeadbeef },
      { path: "Handouts/Handout 01.jpg", uncompressedSize: 5678, crc32: 0x12345678 },
    ]);
  });

  it("falls back to a single-byte-per-char decoding when the UTF-8 flag is not set", async () => {
    const file = buildSyntheticZipFile([{ path: "Handouts/e.jpg", size: 1, crc32: 1, utf8: false }]);
    const { entries } = await readZipCentralDirectory(file);
    expect(entries).toEqual([{ path: "Handouts/e.jpg", uncompressedSize: 1, crc32: 1 }]);
  });

  it("passes directory entries through unfiltered — filtering is core's responsibility, not the adapter's", async () => {
    const file = buildSyntheticZipFile([
      { path: "Tokens/", size: 0, crc32: 0 },
      { path: "Tokens/a.png", size: 10, crc32: 1 },
    ]);
    const { entries } = await readZipCentralDirectory(file);
    expect(entries.map((entry) => entry.path)).toEqual(["Tokens/", "Tokens/a.png"]);
  });

  it("reports zip-eocd-not-found for a buffer with no End Of Central Directory record", async () => {
    const file = new File([new Uint8Array(30)], "not-a-zip.bin");
    const { entries, issues } = await readZipCentralDirectory(file);
    expect(entries).toEqual([]);
    expect(issues).toEqual([{ code: "zip-eocd-not-found", severity: "error" }]);
  });

  it("reports zip-zip64-unsupported when the EOCD carries the ZIP64 sentinel values", async () => {
    const eocdBytes = buildEocd(0xffff, 0, 0xffffffff);
    const file = new File([new Uint8Array(eocdBytes)], "zip64.zip");
    const { entries, issues } = await readZipCentralDirectory(file);
    expect(entries).toEqual([]);
    expect(issues).toEqual([{ code: "zip-zip64-unsupported", severity: "error" }]);
  });

  it("reports zip-encrypted-entries-unsupported while still returning the parsed entries", async () => {
    const file = buildSyntheticZipFile([{ path: "secret.pdf", size: 1, crc32: 1, encrypted: true }]);
    const { entries, issues } = await readZipCentralDirectory(file);
    expect(entries).toHaveLength(1);
    expect(issues).toEqual([{ code: "zip-encrypted-entries-unsupported", severity: "error" }]);
  });

  it("rejects a Unix symlink from central-directory metadata before a legacy hash can match", async () => {
    const file = buildSyntheticZipFile([{ path: "Tokens/link.png", size: 6, crc32: 1, unixMode: 0xa1ff }]);
    expect((await readZipCentralDirectory(file)).issues)
      .toContainEqual({ code: "zip-invalid-entries", severity: "error" });
  });
});
