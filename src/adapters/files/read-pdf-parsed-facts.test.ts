import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockPasswordException extends Error {
    readonly code: number;
    constructor(message: string, code: number) {
      super(message);
      this.name = "PasswordException";
      this.code = code;
    }
  }
  return { getDocument: vi.fn(), PasswordException: MockPasswordException };
});

vi.mock("pdfjs-dist", () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: { workerSrc: "" },
  PasswordException: mocks.PasswordException,
  PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({ default: "worker.mjs" }));

import { readPdfParsedFacts } from "./read-pdf-parsed-facts";

const getDocumentMock = mocks.getDocument;
const MockPasswordException = mocks.PasswordException;

function fakePage(text: string, lang: string | null) {
  return {
    getTextContent: async () => ({ lang, items: [{ str: text }] }),
  };
}

function fakeDocument(overrides: {
  numPages?: number;
  info?: Record<string, unknown>;
  pages?: ReturnType<typeof fakePage>[];
} = {}) {
  const pages = overrides.pages ?? [fakePage("", null)];
  return {
    numPages: overrides.numPages ?? pages.length,
    getMetadata: async () => ({ info: overrides.info ?? {}, metadata: null }),
    getPage: async (pageNumber: number) => pages[pageNumber - 1],
  };
}

beforeEach(() => {
  getDocumentMock.mockReset();
});

describe("readPdfParsedFacts", () => {
  it("extracts producer, creator, page count, language, and the version stamp on success", async () => {
    const destroy = vi.fn(async () => undefined);
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve(
        fakeDocument({
          numPages: 1,
          info: { Producer: "Adobe PDF Library 18.0", Creator: "Adobe InDesign 21.5 (Windows)" },
          pages: [fakePage("hello Pacote #1 | Jan/2020 | v1.1 world", "pt-BR")],
        }),
      ),
      destroy,
    });

    const result = await readPdfParsedFacts(new ArrayBuffer(0), null);

    expect(result).toEqual({
      status: "success",
      facts: {
        pageCount: 1,
        producer: "Adobe PDF Library 18.0",
        creator: "Adobe InDesign 21.5 (Windows)",
        lang: "pt-BR",
        versionStampTag: "Pacote #1 | Jan/2020 | v1.1",
      },
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("maps a NEED_PASSWORD PasswordException to password-required", async () => {
    const destroy = vi.fn(async () => undefined);
    getDocumentMock.mockReturnValue({
      promise: Promise.reject(new MockPasswordException("needs password", 1)),
      destroy,
    });

    const result = await readPdfParsedFacts(new ArrayBuffer(0), null);
    expect(result).toEqual({ status: "password-required" });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("maps an INCORRECT_PASSWORD PasswordException to incorrect-password", async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.reject(new MockPasswordException("wrong password", 2)),
      destroy: vi.fn(async () => undefined),
    });

    const result = await readPdfParsedFacts(new ArrayBuffer(0), "wrong");
    expect(result).toEqual({ status: "incorrect-password" });
  });

  it("maps any other rejection to a generic failure, never a password state", async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.reject(new Error("corrupt PDF")),
      destroy: vi.fn(async () => undefined),
    });

    const result = await readPdfParsedFacts(new ArrayBuffer(0), null);
    expect(result).toEqual({ status: "failed" });
  });

  it("maps a failure raised while reading metadata/pages after a successful load to failed", async () => {
    const destroy = vi.fn(async () => undefined);
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getMetadata: async () => {
          throw new Error("boom");
        },
        getPage: async () => fakePage("", null),
      }),
      destroy,
    });

    const result = await readPdfParsedFacts(new ArrayBuffer(0), null);
    expect(result).toEqual({ status: "failed" });
    expect(destroy).toHaveBeenCalledOnce();
  });
});
