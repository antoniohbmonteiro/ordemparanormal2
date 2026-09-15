import { describe, expect, it } from "vitest";

import type { KnownPdfEdition, PdfEditionId } from "./known-adventure-sources";
import type { PdfParseAttempt, PdfPrePasswordFacts } from "./pdf-source-facts";
import { recognizePdfSource } from "./recognize-pdf-source";

const KNOWN_HASH = "a".repeat(64);
const UNKNOWN_HASH = "b".repeat(64);

const KNOWN_EDITIONS: Record<PdfEditionId, KnownPdfEdition> = {
  "playtest-alpha-v1.1": {
    sha256: KNOWN_HASH,
    encryptionProfile: { v: 5, r: 6, length: 256, streamFilter: "StdCF", stringFilter: "StdCF" },
    structural: { producer: "Test Producer", lang: "pt-BR", pageCount: 10 },
  },
  "playtest-alpha-v1.0": {
    sha256: "c".repeat(64),
    structural: {},
  },
};

function pre(overrides: Partial<PdfPrePasswordFacts> = {}): PdfPrePasswordFacts {
  return {
    byteLength: 1000,
    sha256: UNKNOWN_HASH,
    pdfVersion: "1.7",
    encryption: { present: false },
    trailerId: null,
    plaintextCatalogHints: null,
    ...overrides,
  };
}

describe("recognizePdfSource", () => {
  it("returns invalid when the PDF header could not be found", () => {
    const result = recognizePdfSource(pre({ pdfVersion: null }), { status: "not-attempted" }, KNOWN_EDITIONS);
    expect(result.status).toBe("invalid");
    expect(result.passwordRequired).toBe(false);
    expect(result.issues).toEqual([{ code: "pdf-header-missing", severity: "error" }]);
  });

  it("recognizes a known edition by hash even before any parse attempt, and keeps passwordRequired true", () => {
    const result = recognizePdfSource(
      pre({ sha256: KNOWN_HASH, encryption: { present: true } }),
      { status: "not-attempted" },
      KNOWN_EDITIONS,
    );
    expect(result).toMatchObject({
      status: "recognized",
      matchMethod: "hash",
      edition: "playtest-alpha-v1.1",
      passwordRequired: true,
    });
    expect(result.issues).toEqual([]);
  });

  it("keeps the hash-recognized edition and passwordRequired true after an incorrect password attempt", () => {
    const result = recognizePdfSource(
      pre({ sha256: KNOWN_HASH, encryption: { present: true } }),
      { status: "incorrect-password" },
      KNOWN_EDITIONS,
    );
    expect(result).toMatchObject({
      status: "recognized",
      matchMethod: "hash",
      edition: "playtest-alpha-v1.1",
      passwordRequired: true,
    });
    expect(result.issues).toEqual([{ code: "pdf-incorrect-password", severity: "warning" }]);
  });

  it("clears passwordRequired once a real parse attempt succeeds, keeping the hash-based edition", () => {
    const parseAttempt: PdfParseAttempt = {
      status: "success",
      facts: { pageCount: 10, producer: "Anything", creator: null, lang: null, versionStampTag: null },
    };
    const result = recognizePdfSource(
      pre({ sha256: KNOWN_HASH, encryption: { present: true } }),
      parseAttempt,
      KNOWN_EDITIONS,
    );
    expect(result).toMatchObject({
      status: "recognized",
      matchMethod: "hash",
      edition: "playtest-alpha-v1.1",
      passwordRequired: false,
    });
    expect(result.issues).toEqual([]);
  });

  it("clears passwordRequired on a generic parse failure without reactivating the password prompt", () => {
    const result = recognizePdfSource(
      pre({ sha256: KNOWN_HASH, encryption: { present: true } }),
      { status: "failed" },
      KNOWN_EDITIONS,
    );
    expect(result).toMatchObject({
      status: "recognized",
      matchMethod: "hash",
      edition: "playtest-alpha-v1.1",
      passwordRequired: false,
    });
    expect(result.issues).toEqual([{ code: "pdf-parse-failed", severity: "error" }]);
  });

  it("recognizes an unknown-hash PDF by a full structural descriptor match", () => {
    const parseAttempt: PdfParseAttempt = {
      status: "success",
      facts: { pageCount: 10, producer: "Test Producer", creator: null, lang: "pt-BR", versionStampTag: null },
    };
    const result = recognizePdfSource(pre(), parseAttempt, KNOWN_EDITIONS);
    expect(result).toMatchObject({
      status: "recognized",
      matchMethod: "structural-parsed",
      edition: "playtest-alpha-v1.1",
      passwordRequired: false,
    });
  });

  it("never counts a partial structural match — one mismatched defined field is enough to reject it", () => {
    const parseAttempt: PdfParseAttempt = {
      status: "success",
      // producer and lang match, but pageCount (also defined in the descriptor) does not.
      facts: { pageCount: 999, producer: "Test Producer", creator: null, lang: "pt-BR", versionStampTag: null },
    };
    const result = recognizePdfSource(pre(), parseAttempt, KNOWN_EDITIONS);
    expect(result.status).toBe("unknown");
    expect(result.matchMethod).toBe("none");
    expect(result.edition).toBeNull();
  });

  it("never matches an edition whose structural descriptor is empty, however similar the facts look", () => {
    const parseAttempt: PdfParseAttempt = {
      status: "success",
      facts: { pageCount: 1, producer: null, creator: null, lang: null, versionStampTag: null },
    };
    const result = recognizePdfSource(pre(), parseAttempt, KNOWN_EDITIONS);
    expect(result.status).toBe("unknown");
    expect(result.edition).toBeNull();
  });

  it("reports a structural-hint (never an edition) when the encryption profile matches a known one pre-password", () => {
    const result = recognizePdfSource(
      pre({
        encryption: { present: true, v: 5, r: 6, length: 256, streamFilter: "StdCF", stringFilter: "StdCF" },
      }),
      { status: "not-attempted" },
      KNOWN_EDITIONS,
    );
    expect(result.status).toBe("unknown");
    expect(result.matchMethod).toBe("structural-hint");
    expect(result.edition).toBeNull();
    expect(result.passwordRequired).toBe(true);
  });

  it("does not report a structural-hint when the encryption profile does not match any known one", () => {
    const result = recognizePdfSource(
      pre({ encryption: { present: true, v: 1, r: 2, length: 40, streamFilter: "V2", stringFilter: "V2" } }),
      { status: "not-attempted" },
      KNOWN_EDITIONS,
    );
    expect(result.matchMethod).toBe("none");
  });

  it("does not report a structural-hint for a generic parse failure, only for password-blocked states", () => {
    const encryption = { present: true, v: 5, r: 6, length: 256, streamFilter: "StdCF", stringFilter: "StdCF" };
    const failed = recognizePdfSource(pre({ encryption }), { status: "failed" }, KNOWN_EDITIONS);
    expect(failed.matchMethod).toBe("none");

    const passwordRequired = recognizePdfSource(pre({ encryption }), { status: "password-required" }, KNOWN_EDITIONS);
    expect(passwordRequired.matchMethod).toBe("structural-hint");
  });
});
