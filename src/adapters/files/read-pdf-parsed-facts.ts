import type { PdfParseAttempt } from "../../core/adventure-import/pdf-source-facts";
import { buildPdfContentSignatureInput, normalizePdfPageText } from "../../core/adventure-import/pdf-content-signature";
import { sha256Hex } from "./compute-sha256";
import { loadPdfJs } from "./pdfjs-document";

const VERSION_STAMP_PATTERN = /Pacote\s*#\d+\s*\|[^|]*\|\s*v\d+\.\d+/;
const VERSION_STAMP_SCAN_PAGE_LIMIT = 5;

export interface ReadPdfParsedFactsOptions {
  readonly includeContentSignature?: boolean;
  readonly pdfJs?: Awaited<ReturnType<typeof loadPdfJs>>;
}

export async function readPdfParsedFacts(
  bytes: ArrayBuffer, password: string | null, options: ReadPdfParsedFactsOptions = {},
): Promise<PdfParseAttempt> {
  const { getDocument, PasswordException, PasswordResponses } = options.pdfJs ?? await loadPdfJs();

  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    ...(password !== null ? { password } : {}),
  });

  try {
    const pdfDocument = await loadingTask.promise;

    const metadata = await pdfDocument.getMetadata().catch(() => null);
    const infoRecord = (metadata?.info ?? {}) as Record<string, unknown>;
    const producer = typeof infoRecord.Producer === "string" ? infoRecord.Producer : null;
    const creator = typeof infoRecord.Creator === "string" ? infoRecord.Creator : null;

    let lang: string | null = null;
    let versionStampTag: string | null = null;
    const pagesToScan = options.includeContentSignature
      ? pdfDocument.numPages : Math.min(pdfDocument.numPages, VERSION_STAMP_SCAN_PAGE_LIMIT);
    const normalizedPages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      if (lang === null) lang = textContent.lang;
      const textItems = textContent.items.map((item) => ("str" in item ? item.str : ""));
      if (options.includeContentSignature) normalizedPages.push(normalizePdfPageText(textItems));

      if (versionStampTag === null && pageNumber <= VERSION_STAMP_SCAN_PAGE_LIMIT) {
        const pageText = textItems.join(" ");
        const match = pageText.match(VERSION_STAMP_PATTERN);
        if (match) versionStampTag = match[0];
      }
    }

    const signatureInput = options.includeContentSignature
      ? buildPdfContentSignatureInput(pdfDocument.numPages, normalizedPages) : null;
    const contentSignatureSha256 = signatureInput === null
      ? null : await sha256Hex(new TextEncoder().encode(signatureInput));

    return {
      status: "success",
      facts: { pageCount: pdfDocument.numPages, producer, creator, lang, versionStampTag, contentSignatureSha256 },
    };
  } catch (error) {
    if (error instanceof PasswordException) {
      if (error.code === PasswordResponses.NEED_PASSWORD) return { status: "password-required" };
      if (error.code === PasswordResponses.INCORRECT_PASSWORD) return { status: "incorrect-password" };
    }
    return { status: "failed" };
  } finally {
    await loadingTask.destroy();
  }
}
