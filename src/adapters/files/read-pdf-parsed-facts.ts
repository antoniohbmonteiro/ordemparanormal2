import type { PdfParseAttempt } from "../../core/adventure-import/pdf-source-facts";

const VERSION_STAMP_PATTERN = /Pacote\s*#\d+\s*\|[^|]*\|\s*v\d+\.\d+/;
const VERSION_STAMP_SCAN_PAGE_LIMIT = 5;

let workerConfigured = false;

// Dynamically imported so pdfjs-dist (a sizeable library) lands in its own chunk,
// loaded only when a PDF is actually analyzed, instead of bloating the main bundle
// that every GM loads on every session start.
async function loadPdfJs() {
  const [pdfjs, workerUrl] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs?url"),
  ]);
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    workerConfigured = true;
  }
  return pdfjs;
}

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
