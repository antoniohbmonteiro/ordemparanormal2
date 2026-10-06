import { sha256Hex } from "../../adapters/files/compute-sha256";
import { readZipCentralDirectory } from "../../adapters/files/read-zip-central-directory";
import { openZipArchive } from "../../adapters/files/open-zip-archive";
import { readZipContentFacts } from "../../adapters/files/read-zip-content-facts";
import { AS09_IMAGES } from "../../config/adventure-definitions/playtest-alpha-as09";
import { buildCanonicalZipFingerprintInput } from "../../core/adventure-import/zip-fingerprint";
import { buildStructuralZipManifestInput, buildStructuralZipPayload, type CanonicalZipPayloadEntry } from "../../core/adventure-import/zip-structural-manifest";
import { buildZipContentManifestInput } from "../../core/adventure-import/zip-content-manifest";
import { isAs09StructuralCandidate, recognizeAs09Source, type As09SourceAnalysis } from "../../core/adventure-import/recognize-as09-source";
import { KNOWN_AS09_PACKAGE } from "../../core/adventure-import/known-adventure-sources";

export function selectAs09ImagePayload(payload: readonly CanonicalZipPayloadEntry[]): readonly CanonicalZipPayloadEntry[] {
  return AS09_IMAGES.map(expected => {
    const actual = payload.find(entry => entry.path === expected.path);
    if (!actual || actual.uncompressedSize !== expected.uncompressedSize || actual.crc32 !== expected.crc32)
      throw new Error(`Imagem AS09 ausente ou incompatível: ${expected.basename}.`);
    return actual;
  });
}

export async function analyzeAs09Source(file: File): Promise<As09SourceAnalysis> {
  try {
    const { entries, issues } = await readZipCentralDirectory(file);
    if (issues.some(issue => issue.severity === "error"))
      return recognizeAs09Source(entries, "", { fileCount: 0, imageCount: 0 }, issues);
    const payload = buildStructuralZipPayload(entries);
    const fingerprint = await sha256Hex(new TextEncoder().encode(buildCanonicalZipFingerprintInput(entries)));
    let images: readonly CanonicalZipPayloadEntry[];
    try { images = selectAs09ImagePayload(payload); }
    catch { return recognizeAs09Source(entries, "", { fileCount: payload.length, imageCount: 0 }); }
    const signature = { fileCount: payload.length, imageCount: images.length };
    if (fingerprint === KNOWN_AS09_PACKAGE.fingerprintHash) return recognizeAs09Source(entries, fingerprint, signature, issues);
    const structural = { ...signature, manifestHash: await sha256Hex(new TextEncoder().encode(buildStructuralZipManifestInput(payload))) };
    if (!isAs09StructuralCandidate(structural)) return recognizeAs09Source(entries, fingerprint, structural, issues);
    const archive = await openZipArchive(file);
    try {
      const content = await readZipContentFacts(archive, entries, images);
      const contentManifestHash = await sha256Hex(new TextEncoder().encode(buildZipContentManifestInput(images, content)));
      return recognizeAs09Source(entries, fingerprint, { ...structural, contentManifestHash }, issues);
    } finally { await archive.close(); }
  } catch {
    return { status: "invalid", matchMethod: "none", issues: [{ code: "zip-invalid-entries", severity: "error" }] };
  }
}
