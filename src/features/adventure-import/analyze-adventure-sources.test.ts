import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readPdfParsedFacts: vi.fn() }));
vi.mock("../../adapters/files/read-pdf-parsed-facts", () => ({ readPdfParsedFacts: mocks.readPdfParsedFacts }));

import { analyzeAdventureSources, analyzePdfSource, analyzeZipActSource } from "./analyze-adventure-sources";

function pdfFile(text: string): File {
  return new File([new TextEncoder().encode(text)], "test.pdf");
}

const UNENCRYPTED_PDF = "%PDF-1.7\ntrailer\n<< /Root 1 0 R >>";
const ENCRYPTED_PDF = [
  "%PDF-1.7",
  "5 0 obj",
  "<< /V 5 /R 6 /Length 256 /StmF /StdCF /StrF /StdCF >>",
  "endobj",
  "trailer",
  "<< /Root 1 0 R /Encrypt 5 0 R >>",
].join("\n");

const SUCCESSFUL_PARSE = {
  status: "success" as const,
  facts: { pageCount: 1, producer: null, creator: null, lang: null, versionStampTag: null, contentSignatureSha256: null },
};

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}
function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function buildSyntheticZipFile(entries: readonly { path: string; size: number; crc32: number }[]): File {
  const records = entries.flatMap((entry) => {
    const nameBytes = [...new TextEncoder().encode(entry.path)];
    return [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(entry.crc32), ...u32(entry.size), ...u32(entry.size),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0),
      ...nameBytes,
    ];
  });
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(records.length), ...u32(0), ...u16(0),
  ];
  return new File([new Uint8Array([...records, ...eocd])], "test.zip");
}

beforeEach(() => {
  mocks.readPdfParsedFacts.mockReset();
});

describe("analyzePdfSource", () => {
  it("skips the real parse attempt entirely when the file is encrypted and no password is given", async () => {
    const result = await analyzePdfSource(pdfFile(ENCRYPTED_PDF), null);
    expect(mocks.readPdfParsedFacts).not.toHaveBeenCalled();
    expect(result.passwordRequired).toBe(true);
    expect(result.facts.parseAttempt).toEqual({ status: "not-attempted" });
  });

  it("always attempts the real parse when a password is supplied, never short-circuited by a hash match", async () => {
    mocks.readPdfParsedFacts.mockResolvedValue(SUCCESSFUL_PARSE);
    const result = await analyzePdfSource(pdfFile(ENCRYPTED_PDF), "senha-correta");
    expect(mocks.readPdfParsedFacts).toHaveBeenCalledOnce();
    expect(result.passwordRequired).toBe(false);
  });

  it("always attempts the real parse for an unencrypted file, even without a password", async () => {
    mocks.readPdfParsedFacts.mockResolvedValue(SUCCESSFUL_PARSE);
    await analyzePdfSource(pdfFile(UNENCRYPTED_PDF), null);
    expect(mocks.readPdfParsedFacts).toHaveBeenCalledOnce();
  });
});

describe("analyzeZipActSource", () => {
  it("reads only the central directory via slice(), never the whole file's arrayBuffer()", async () => {
    const file = buildSyntheticZipFile([
      { path: "Tokens/a.png", size: 10, crc32: 1 },
      { path: "Handouts/b.jpg", size: 20, crc32: 2 },
    ]);
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer");

    const result = await analyzeZipActSource(file, "actOne");

    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(result.act).toBe("actOne");
    expect(result.inventory).toEqual({
      totalFiles: 2,
      totalBytes: 30,
      topLevelFolders: [
        { name: "Handouts", fileCount: 1 },
        { name: "Tokens", fileCount: 1 },
      ],
    });
  });
});

describe("analyzeAdventureSources", () => {
  it("returns null for act slots that were not selected, without reading them", async () => {
    mocks.readPdfParsedFacts.mockResolvedValue(SUCCESSFUL_PARSE);
    const result = await analyzeAdventureSources({
      pdf: pdfFile(UNENCRYPTED_PDF),
      actOne: null,
      actTwo: null,
      password: null,
    });
    expect(result.actOne).toBeNull();
    expect(result.actTwo).toBeNull();
  });

  it("analyzes the pdf and both acts together when all three are selected", async () => {
    mocks.readPdfParsedFacts.mockResolvedValue(SUCCESSFUL_PARSE);
    const actOne = buildSyntheticZipFile([{ path: "a.png", size: 1, crc32: 1 }]);
    const actTwo = buildSyntheticZipFile([{ path: "b.png", size: 2, crc32: 2 }]);

    const result = await analyzeAdventureSources({ pdf: pdfFile(UNENCRYPTED_PDF), actOne, actTwo, password: null });

    expect(result.pdf.facts.parseAttempt.status).toBe("success");
    expect(result.actOne?.act).toBe("actOne");
    expect(result.actTwo?.act).toBe("actTwo");
  });
});
