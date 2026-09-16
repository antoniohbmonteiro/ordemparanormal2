import type { PdfParseAttempt } from "../../core/adventure-import/pdf-source-facts";
import { loadPdfJs } from "./pdfjs-document";

const VERSION_STAMP_PATTERN = /Pacote\s*#\d+\s*\|[^|]*\|\s*v\d+\.\d+/;
const VERSION_STAMP_SCAN_PAGE_LIMIT = 5;

export async function readPdfParsedFacts(bytes: ArrayBuffer, password: string | null): Promise<PdfParseAttempt> {
  const { getDocument, PasswordException, PasswordResponses } = await loadPdfJs();

  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    ...(password !== null ? { password } : {}),
  });

  try {
    const pdfDocument = await loadingTask.promise;

    const { info } = await pdfDocument.getMetadata();
    const infoRecord = info as Record<string, unknown>;
    const producer = typeof infoRecord.Producer === "string" ? infoRecord.Producer : null;
    const creator = typeof infoRecord.Creator === "string" ? infoRecord.Creator : null;

    let lang: string | null = null;
    let versionStampTag: string | null = null;
    const pagesToScan = Math.min(pdfDocument.numPages, VERSION_STAMP_SCAN_PAGE_LIMIT);

    for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      if (lang === null) lang = textContent.lang;

      if (versionStampTag === null) {
        const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        const match = pageText.match(VERSION_STAMP_PATTERN);
        if (match) versionStampTag = match[0];
      }
    }

    return {
      status: "success",
      facts: { pageCount: pdfDocument.numPages, producer, creator, lang, versionStampTag },
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
