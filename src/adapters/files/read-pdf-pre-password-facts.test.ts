import { describe, expect, it } from "vitest";

import { readPdfPrePasswordFacts } from "./read-pdf-pre-password-facts";

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("readPdfPrePasswordFacts", () => {
  it("reads the PDF header version and byte length", () => {
    const facts = readPdfPrePasswordFacts(bytesOf("%PDF-1.7\n"), "sha");
    expect(facts.pdfVersion).toBe("1.7");
    expect(facts.byteLength).toBe(9);
    expect(facts.sha256).toBe("sha");
  });

  it("returns a null pdfVersion when no PDF header is present", () => {
    const facts = readPdfPrePasswordFacts(bytesOf("not a pdf at all"), "sha");
    expect(facts.pdfVersion).toBeNull();
  });

  it("reports no encryption when the trailer has no /Encrypt entry", () => {
    const facts = readPdfPrePasswordFacts(bytesOf("%PDF-1.7\ntrailer\n<< /Root 1 0 R >>"), "sha");
    expect(facts.encryption).toEqual({ present: false });
  });

  it("extracts the encryption dictionary parameters when /Encrypt is present", () => {
    const text = [
      "%PDF-1.7",
      "5 0 obj",
      "<< /Filter /Standard /Length 256 /P -1028 /R 6 /StmF /StdCF /StrF /StdCF /V 5 >>",
      "endobj",
      "trailer",
      "<< /Root 6 0 R /Encrypt 5 0 R >>",
    ].join("\n");
    const facts = readPdfPrePasswordFacts(bytesOf(text), "sha");
    expect(facts.encryption).toEqual({
      present: true,
      v: 5,
      r: 6,
      length: 256,
      permissions: -1028,
      streamFilter: "StdCF",
      stringFilter: "StdCF",
    });
  });

  it("still reports encryption present, with no other fields, when the referenced object cannot be found", () => {
    const facts = readPdfPrePasswordFacts(bytesOf("%PDF-1.7\ntrailer\n<< /Encrypt 5 0 R >>"), "sha");
    expect(facts.encryption).toEqual({ present: true });
  });

  it("extracts the trailer /ID pair", () => {
    const facts = readPdfPrePasswordFacts(
      bytesOf("%PDF-1.7\ntrailer\n<< /ID [<AABBCCDD><11223344>] >>"),
      "sha",
    );
    expect(facts.trailerId).toEqual(["AABBCCDD", "11223344"]);
  });

  it("returns a null trailerId when no /ID entry is present", () => {
    const facts = readPdfPrePasswordFacts(bytesOf("%PDF-1.7\ntrailer\n<< /Root 1 0 R >>"), "sha");
    expect(facts.trailerId).toBeNull();
  });

  it("reads plaintext Catalog hints, including the declared page count via the Pages tree", () => {
    const text = [
      "%PDF-1.7",
      "1 0 obj",
      "<< /Type /Catalog /Pages 2 0 R /Lang (pt-BR) /PageLayout /TwoPageRight /StructTreeRoot 3 0 R /OCProperties << >> >>",
      "endobj",
      "2 0 obj",
      "<< /Type /Pages /Count 42 /Kids [] >>",
      "endobj",
      "trailer",
      "<< /Root 1 0 R >>",
    ].join("\n");
    const facts = readPdfPrePasswordFacts(bytesOf(text), "sha");
    expect(facts.plaintextCatalogHints).toEqual({
      lang: "pt-BR",
      pageLayout: "TwoPageRight",
      hasStructTreeRoot: true,
      hasOcProperties: true,
      declaredPageCount: 42,
    });
  });

  it("returns null plaintextCatalogHints when there is no /Root entry to resolve", () => {
    const facts = readPdfPrePasswordFacts(bytesOf("%PDF-1.7\ntrailer\n<< /Encrypt 5 0 R >>"), "sha");
    expect(facts.plaintextCatalogHints).toBeNull();
  });

  it("degrades declaredPageCount to null when the Pages object cannot be resolved, without losing other hints", () => {
    const text = [
      "%PDF-1.7",
      "1 0 obj",
      "<< /Type /Catalog /Pages 99 0 R /Lang (pt-BR) >>",
      "endobj",
      "trailer",
      "<< /Root 1 0 R >>",
    ].join("\n");
    const facts = readPdfPrePasswordFacts(bytesOf(text), "sha");
    expect(facts.plaintextCatalogHints).toEqual({
      lang: "pt-BR",
      pageLayout: null,
      hasStructTreeRoot: false,
      hasOcProperties: false,
      declaredPageCount: null,
    });
  });
});
