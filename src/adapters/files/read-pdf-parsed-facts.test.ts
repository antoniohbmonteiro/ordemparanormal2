import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockPasswordException extends Error {
    constructor(message: string, readonly code: number) { super(message); }
  }
  return { getDocument: vi.fn(), PasswordException: MockPasswordException };
});
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: mocks.getDocument, GlobalWorkerOptions: { workerSrc: "" },
  PasswordException: mocks.PasswordException,
  PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
}));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?url", () => ({ default: "worker.mjs" }));

import { readPdfParsedFacts, type ReadPdfParsedFactsOptions } from "./read-pdf-parsed-facts";

function fakePage(text: string, lang: string | null) {
  return { getTextContent: async () => ({ lang, items: [{ str: text }] }) };
}
function fakeDocument(pages: ReturnType<typeof fakePage>[], info: Record<string, unknown> = {}) {
  return { numPages: pages.length, getMetadata: async () => ({ info }),
    getPage: async (pageNumber: number) => pages[pageNumber - 1] };
}

beforeEach(() => mocks.getDocument.mockReset());

describe("readPdfParsedFacts", () => {
  it("extracts metadata, language and version stamp without a full content hash", async () => {
    const destroy = vi.fn(async () => undefined);
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(fakeDocument([
      fakePage("hello Pacote #1 | Jan/2020 | v1.1 world", "pt-BR"),
    ], { Producer: "Adobe PDF Library 18.0", Creator: "Adobe InDesign 21.5 (Windows)" })), destroy });
    expect(await readPdfParsedFacts(new ArrayBuffer(0), null)).toEqual({ status: "success", facts: {
      pageCount: 1, producer: "Adobe PDF Library 18.0", creator: "Adobe InDesign 21.5 (Windows)",
      lang: "pt-BR", versionStampTag: "Pacote #1 | Jan/2020 | v1.1", contentSignatureSha256: null,
    } });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("maps required and incorrect passwords, and forwards an accepted password", async () => {
    const destroy = vi.fn(async () => undefined);
    mocks.getDocument.mockReturnValueOnce({
      promise: Promise.reject(new mocks.PasswordException("needs password", 1)), destroy,
    }).mockReturnValueOnce({
      promise: Promise.reject(new mocks.PasswordException("wrong password", 2)), destroy,
    }).mockReturnValueOnce({
      promise: Promise.resolve(fakeDocument([fakePage("Pacote #1 | Jan/2020 | v1.0", "pt-BR")])), destroy,
    });
    expect(await readPdfParsedFacts(new ArrayBuffer(0), null)).toEqual({ status: "password-required" });
    expect(await readPdfParsedFacts(new ArrayBuffer(0), "wrong")).toEqual({ status: "incorrect-password" });
    expect(await readPdfParsedFacts(new ArrayBuffer(0), "correct-password"))
      .toMatchObject({ status: "success", facts: { versionStampTag: "Pacote #1 | Jan/2020 | v1.0" } });
    expect(mocks.getDocument).toHaveBeenLastCalledWith({ data: new Uint8Array(0), password: "correct-password" });
    expect(destroy).toHaveBeenCalledTimes(3);
  });

  it("maps an unrelated load or page failure to failed", async () => {
    const destroy = vi.fn(async () => undefined);
    mocks.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error("corrupt PDF")), destroy })
      .mockReturnValueOnce({ promise: Promise.resolve({ numPages: 1, getMetadata: async () => ({ info: {} }),
        getPage: async () => { throw new Error("corrupt page"); } }), destroy });
    expect(await readPdfParsedFacts(new ArrayBuffer(0), null)).toEqual({ status: "failed" });
    expect(await readPdfParsedFacts(new ArrayBuffer(0), null)).toEqual({ status: "failed" });
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("continues content recognition when optional metadata cannot be read", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1,
      getMetadata: async () => { throw new Error("bad metadata"); },
      getPage: async () => fakePage("Pacote #1 | Jan/2020 | v1.0", "pt-BR"),
    }), destroy: vi.fn(async () => undefined) });
    expect(await readPdfParsedFacts(new ArrayBuffer(0), null)).toMatchObject({ status: "success",
      facts: { producer: null, creator: null, versionStampTag: "Pacote #1 | Jan/2020 | v1.0" } });
  });

  it("extracts the full signature in one PDF.js document session and visits each page once", async () => {
    const getPage = vi.fn(async (pageNumber: number) => ({
      getTextContent: async () => ({ lang: "pt-BR", items: [{ str: pageNumber === 1
        ? `Pacote #8 | Agosto/2026 | v1.0 ${"A".repeat(300)}` : `Page ${pageNumber}` }] }),
    }));
    const destroy = vi.fn(async () => undefined);
    const getDocument = vi.fn(() => ({ promise: Promise.resolve({
      numPages: 6, getMetadata: async () => ({ info: { Producer: "Test", Creator: "Test" } }),
      getPage,
    }), destroy }));
    class PasswordException extends Error { code = 0; }
    const pdfJs = { getDocument, PasswordException, PasswordResponses: {
      NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2,
    } } as unknown as NonNullable<ReadPdfParsedFactsOptions["pdfJs"]>;
    const result = await readPdfParsedFacts(new ArrayBuffer(1), null,
      { includeContentSignature: true, pdfJs });
    expect(result).toMatchObject({ status: "success", facts: {
      pageCount: 6, versionStampTag: "Pacote #8 | Agosto/2026 | v1.0",
    } });
    if (result.status !== "success") throw new Error("Expected successful parse");
    expect(result.facts.contentSignatureSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(getDocument).toHaveBeenCalledOnce();
    expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
