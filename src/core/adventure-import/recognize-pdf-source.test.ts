import { describe, expect, it } from "vitest";
import { KNOWN_PDF_EDITIONS, type KnownPdfEdition, type PdfEditionId } from "./known-adventure-sources";
import type { PdfParsedFacts, PdfPrePasswordFacts } from "./pdf-source-facts";
import { recognizePdfSource } from "./recognize-pdf-source";

const KNOWN: Record<PdfEditionId, KnownPdfEdition> = {
  "playtest-alpha-v1.0": {
    edition: "playtest-alpha-v1.0",
    variant: "agents",
    supportedActs: ["actOne", "actTwo"],
    sha256Hashes: ["hash-v10"],
    encryptionProfile: { v: 5, r: 6, length: 256, streamFilter: "StdCF", stringFilter: "StdCF" },
    structural: { pageCount: 103, versionStampPattern: /v1\.0\b/, producer: "Original" },
    contentSignatureSha256: "content-v10",
  },
  "playtest-alpha-v1.1": {
    edition: "playtest-alpha-v1.1",
    variant: "agents",
    supportedActs: ["actOne", "actTwo"],
    sha256Hashes: ["hash-v11"],
    structural: { pageCount: 104, versionStampPattern: /v1\.1\b/, producer: "Original" },
    contentSignatureSha256: "content-v11",
  },
};

function pre(overrides: Partial<PdfPrePasswordFacts> = {}): PdfPrePasswordFacts {
  return {
    byteLength: 1000, sha256: "unknown", pdfVersion: "1.7", encryption: { present: false },
    trailerId: null, plaintextCatalogHints: null, ...overrides,
  };
}

function parsed(overrides: Partial<PdfParsedFacts> = {}) {
  return { status: "success" as const, facts: {
    pageCount: 103, producer: "Other tool", creator: "Other tool", lang: "en",
    versionStampTag: "Pacote #8 | Agosto/2026 | v1.0", contentSignatureSha256: "content-v10",
    ...overrides,
  } };
}

describe("recognizePdfSource", () => {
  it("preserves the measured original, unlocked and v1.1 binary hashes", () => {
    for (const [sha256, edition] of [
      ["697f767ffabe1cfa8b06fbc41bd12f7c29bbc1b9775f6663e0ec4950c31d8c95", "playtest-alpha-v1.0"],
      ["4867109f62bab4ee95fbfcd81166a43f6ef5c5a0534ab8aabc50cf8531450d38", "playtest-alpha-v1.0"],
      ["f51bf5de8a94c6fd38d92069a67e384f11c6bc989c13a5a08f297b88075727da", "playtest-alpha-v1.1"],
    ] as const) {
      expect(recognizePdfSource(pre({ sha256 }), { status: "not-attempted" }, KNOWN_PDF_EDITIONS))
        .toMatchObject({ status: "recognized", matchMethod: "hash", edition });
    }
  });

  it("recognizes the same content despite changed Producer, Creator and language", () => {
    expect(recognizePdfSource(pre(), parsed(), KNOWN))
      .toMatchObject({ status: "recognized", matchMethod: "content", edition: "playtest-alpha-v1.0" });
  });

  it("recognizes the measured v1.0 content in an unlocked PDF with a new binary hash", () => {
    expect(recognizePdfSource(pre({ sha256: "0f00f934d66ebe1569a7f219585bc44e8dfe0bca4179b2fcafd56aa45a10eca3" }),
      parsed({ producer: "iLovePDF", creator: null, lang: "pt-BR",
        contentSignatureSha256: "1a52a85b71e22c5e87c85a87a24efeb169d33f6b5f4fee45a2a70e8814159e1b" }),
      KNOWN_PDF_EDITIONS))
      .toMatchObject({ status: "recognized", matchMethod: "content", edition: "playtest-alpha-v1.0" });
  });

  it("recognizes the measured v1.1 content only as v1.1", () => {
    expect(recognizePdfSource(pre(), parsed({
      pageCount: 104, versionStampTag: "Pacote #8 | Agosto/2026 | v1.1",
      contentSignatureSha256: "bdee1ce4fba3281565e2f62ec3f5fdb8cf29578b01da36f715a3adb3d313d07b",
    }), KNOWN_PDF_EDITIONS))
      .toMatchObject({ status: "recognized", matchMethod: "content", edition: "playtest-alpha-v1.1" });
  });

  it("recognizes the measured survivors variant by hash and full text, without using its filename", () => {
    const byHash = recognizePdfSource(pre({ sha256: "6b821c7118d31304273c085c53fc18e7f477548bd0bf781663b9e10b9fd82fa1" }),
      parsed({ pageCount: 66, versionStampTag: "Pacote #8 | Agosto/2026 | v1.1",
        contentSignatureSha256: "55eaf86fa6d9125b50ee59c4dde79600d542c691642781c2d17065227d0639f9" }), KNOWN_PDF_EDITIONS);
    expect(byHash).toMatchObject({ status: "recognized", matchMethod: "hash", edition: "playtest-alpha-v1.1",
      variant: "survivors", supportedActs: ["actOne"] });
    expect(recognizePdfSource(pre(), parsed({ pageCount: 66, versionStampTag: "Pacote #8 | Agosto/2026 | v1.1",
      contentSignatureSha256: "55eaf86fa6d9125b50ee59c4dde79600d542c691642781c2d17065227d0639f9" }),
    KNOWN_PDF_EDITIONS)).toMatchObject({ status: "recognized", matchMethod: "content", variant: "survivors" });
    expect(recognizePdfSource(pre(), parsed({ pageCount: 104, versionStampTag: "Pacote #8 | Agosto/2026 | v1.1",
      contentSignatureSha256: "55eaf86fa6d9125b50ee59c4dde79600d542c691642781c2d17065227d0639f9" }),
    KNOWN_PDF_EDITIONS).status).toBe("unknown");
  });

  it.each([
    { contentSignatureSha256: "wrong" }, { contentSignatureSha256: null },
    { pageCount: 104 }, { versionStampTag: "Pacote #8 | Agosto/2026 | v1.1" },
  ])("rejects content or edition guard mismatches: %j", (change) => {
    expect(recognizePdfSource(pre(), parsed(change), KNOWN))
      .toMatchObject({ status: "unknown", matchMethod: "none", edition: null });
  });

  it("recognizes v1.1 only with its own content and guards", () => {
    expect(recognizePdfSource(pre(), parsed({
      pageCount: 104, versionStampTag: "Pacote #8 | Agosto/2026 | v1.1", contentSignatureSha256: "content-v11",
    }), KNOWN)).toMatchObject({ status: "recognized", matchMethod: "content", edition: "playtest-alpha-v1.1" });
  });

  it("does not accept metadata and page count without a registered content signature", () => {
    expect(recognizePdfSource(pre(), parsed({ producer: "Original", contentSignatureSha256: "wrong" }), KNOWN))
      .toMatchObject({ status: "unknown", edition: null });
    expect(recognizePdfSource(pre(), parsed(), KNOWN_PDF_EDITIONS))
      .toMatchObject({ status: "unknown", edition: null });
  });

  it("preserves password handling for a hash match", () => {
    const encrypted = pre({ sha256: "hash-v10", encryption: { present: true } });
    expect(recognizePdfSource(encrypted, { status: "not-attempted" }, KNOWN))
      .toMatchObject({ status: "recognized", matchMethod: "hash", passwordRequired: true });
    expect(recognizePdfSource(encrypted, { status: "incorrect-password" }, KNOWN))
      .toMatchObject({ status: "recognized", passwordRequired: true,
        issues: [{ code: "pdf-incorrect-password", severity: "warning" }] });
    expect(recognizePdfSource(encrypted, parsed(), KNOWN).passwordRequired).toBe(false);
  });

  it("reports an encryption hint without assigning an edition", () => {
    expect(recognizePdfSource(pre({ encryption: {
      present: true, v: 5, r: 6, length: 256, streamFilter: "StdCF", stringFilter: "StdCF",
    } }), { status: "password-required" }, KNOWN))
      .toMatchObject({ status: "unknown", matchMethod: "structural-hint", edition: null });
  });

  it("rejects a missing PDF header", () => {
    expect(recognizePdfSource(pre({ pdfVersion: null }), parsed(), KNOWN))
      .toMatchObject({ status: "invalid", passwordRequired: false, issues: [{ code: "pdf-header-missing" }] });
  });
});
