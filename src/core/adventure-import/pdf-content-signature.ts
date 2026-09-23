/** The framing is versioned so future extraction changes cannot silently reuse old hashes. */
export function normalizePdfPageText(items: readonly string[]): string {
  return items.join("").normalize("NFKC").replace(/[\u00ad\u200b-\u200d\u2060\ufeff\p{White_Space}]/gu, "");
}

export function buildPdfContentSignatureInput(pageCount: number, pages: readonly string[]): string | null {
  if (pages.length !== pageCount || pages.join("").length < 256) return null;
  return `op2-pdf-text-v1\n${pageCount}\n${pages.join("\n")}`;
}
