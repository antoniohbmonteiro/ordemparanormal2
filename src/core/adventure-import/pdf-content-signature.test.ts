import { describe, expect, it } from "vitest";
import { buildPdfContentSignatureInput, normalizePdfPageText } from "./pdf-content-signature";

describe("PDF content signature input", () => {
  it("is stable across text-item chunking, whitespace and extraction artifacts", () => {
    expect(normalizePdfPageText(["Ordem ", "Para\u00adnormal\n", "  v1.0"]))
      .toBe(normalizePdfPageText(["Or", "demPara", "normal\u200b", "v1.0"]));
    expect(normalizePdfPageText(["ＡＢＣ"])).toBe("ABC");
  });

  it("preserves meaningful punctuation and page boundaries", () => {
    const first = buildPdfContentSignatureInput(2, ["a".repeat(256), "b"]);
    const second = buildPdfContentSignatureInput(2, ["a".repeat(255), "ab"]);
    expect(first).not.toBe(second);
    expect(normalizePdfPageText(["A, B"])).not.toBe(normalizePdfPageText(["A. B"]));
  });

  it("rejects absent or insufficient text", () => {
    expect(buildPdfContentSignatureInput(1, [""])).toBeNull();
    expect(buildPdfContentSignatureInput(2, ["a".repeat(256)])).toBeNull();
  });
});
