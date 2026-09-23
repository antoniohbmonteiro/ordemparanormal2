import type { AdventureImportIssue } from "../../core/adventure-import/recognition-status";
import type { ZipCentralDirectoryEntry } from "../../core/adventure-import/zip-central-directory-entry";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const EOCD_MAX_SIZE = 22 + 0xffff; // fixed record + maximum archive comment length
const UTF8_FLAG_BIT = 0x0800;
const ENCRYPTED_FLAG_BIT = 0x0001;

export interface ReadZipCentralDirectoryResult {
  readonly entries: readonly ZipCentralDirectoryEntry[];
  readonly issues: readonly AdventureImportIssue[];
}

function findEocdOffset(tail: DataView): number | null {
  for (let offset = tail.byteLength - 22; offset >= 0; offset--) {
    if (tail.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return null;
}

export async function readZipCentralDirectory(file: File): Promise<ReadZipCentralDirectoryResult> {
  const tailSize = Math.min(file.size, EOCD_MAX_SIZE);
  const tailBuffer = await file.slice(file.size - tailSize, file.size).arrayBuffer();
  const tail = new DataView(tailBuffer);

  const eocdOffset = findEocdOffset(tail);
  if (eocdOffset === null) {
    return { entries: [], issues: [{ code: "zip-eocd-not-found", severity: "error" }] };
  }

  const invalid = (): ReadZipCentralDirectoryResult => ({
    entries: [], issues: [{ code: "zip-eocd-not-found", severity: "error" }],
  });
  const archiveEocdOffset = file.size - tailSize + eocdOffset;
  const commentLength = tail.getUint16(eocdOffset + 20, true);
  if (eocdOffset + 22 + commentLength !== tail.byteLength
    || tail.getUint16(eocdOffset + 4, true) !== 0
    || tail.getUint16(eocdOffset + 6, true) !== 0
    || tail.getUint16(eocdOffset + 8, true) !== tail.getUint16(eocdOffset + 10, true)) return invalid();

  const centralDirectoryEntryCount = tail.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = tail.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = tail.getUint32(eocdOffset + 16, true);

  if (centralDirectoryOffset === 0xffffffff || centralDirectoryEntryCount === 0xffff) {
    return { entries: [], issues: [{ code: "zip-zip64-unsupported", severity: "error" }] };
  }
  if (centralDirectoryOffset + centralDirectorySize !== archiveEocdOffset) return invalid();

  const centralDirectoryBuffer = await file
    .slice(centralDirectoryOffset, centralDirectoryOffset + centralDirectorySize)
    .arrayBuffer();
  const centralDirectory = new DataView(centralDirectoryBuffer);
  const centralDirectoryBytes = new Uint8Array(centralDirectoryBuffer);

  const entries: ZipCentralDirectoryEntry[] = [];
  const issues: AdventureImportIssue[] = [];
  let hasEncryptedEntry = false;
  let hasSymlinkEntry = false;
  let position = 0;

  for (let i = 0; i < centralDirectoryEntryCount; i++) {
    if (position + 46 > centralDirectory.byteLength) return invalid();
    if (centralDirectory.getUint32(position, true) !== CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      return invalid();
    }

    const generalPurposeFlag = centralDirectory.getUint16(position + 8, true);
    const unixMode = centralDirectory.getUint32(position + 38, true) >>> 16;
    if ((unixMode & 0xf000) === 0xa000) hasSymlinkEntry = true;
    const crc32 = centralDirectory.getUint32(position + 16, true);
    const uncompressedSize = centralDirectory.getUint32(position + 24, true);
    const nameLength = centralDirectory.getUint16(position + 28, true);
    const extraLength = centralDirectory.getUint16(position + 30, true);
    const commentLength = centralDirectory.getUint16(position + 32, true);

    const nameStart = position + 46;
    if (nameStart + nameLength + extraLength + commentLength > centralDirectory.byteLength) return invalid();
    const nameBytes = centralDirectoryBytes.subarray(nameStart, nameStart + nameLength);
    const isUtf8 = (generalPurposeFlag & UTF8_FLAG_BIT) !== 0;
    let path: string;
    try {
      path = new TextDecoder(isUtf8 ? "utf-8" : "windows-1252", { fatal: true }).decode(nameBytes);
    } catch {
      return invalid();
    }

    if ((generalPurposeFlag & ENCRYPTED_FLAG_BIT) !== 0) hasEncryptedEntry = true;

    entries.push({ path, uncompressedSize, crc32 });
    position = nameStart + nameLength + extraLength + commentLength;
  }
  if (position !== centralDirectory.byteLength) return invalid();

  if (hasEncryptedEntry) {
    issues.push({ code: "zip-encrypted-entries-unsupported", severity: "error" });
  }
  if (hasSymlinkEntry) issues.push({ code: "zip-invalid-entries", severity: "error" });

  return { entries, issues };
}
