import type { PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import { loadPdfJs } from "./pdfjs-document";

export interface AdventurePdfTextItem {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly order: number;
}
export interface AdventurePdfTextPage {
  readonly number: number;
  readonly items: readonly AdventurePdfTextItem[];
}

const ACT_PAGES = { actOne: [35, 59], actTwo: [82, 100] } as const;

export async function readAdventurePoiPages(file: File, password: string | null,
  pdf: PdfSourceAnalysis): Promise<readonly AdventurePdfTextPage[]> {
  if (pdf.status !== "recognized" || pdf.passwordRequired || pdf.facts.parseAttempt.status !== "success"
    || !pdf.edition || !pdf.variant) throw new Error("PDF não reconhecido ou não lido.");
  const pdfJs = await loadPdfJs();
  const task = pdfJs.getDocument({ data: new Uint8Array(await file.arrayBuffer()),
    ...(password !== null ? { password } : {}) });
  try {
    const document = await task.promise;
    if (document.numPages !== pdf.facts.parseAttempt.facts.pageCount) throw new Error("O PDF mudou após o reconhecimento.");
    const pages: AdventurePdfTextPage[] = [];
    for (const act of pdf.supportedActs) {
      const [first, last] = ACT_PAGES[act];
      if (last > document.numPages) throw new Error("Páginas de POI indisponíveis.");
      for (let number = first; number <= last; number++) {
        const content = await (await document.getPage(number)).getTextContent();
        pages.push({ number, items: content.items.flatMap((item, order) => "str" in item && item.str.trim()
          ? [{ text: item.str, x: item.transform[4], y: item.transform[5], height: item.height, order }] : []) });
      }
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
