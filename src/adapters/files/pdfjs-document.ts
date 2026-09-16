let workerConfigured = false;

// Keep PDF.js and its worker lazy so normal world startup does not load either.
export async function loadPdfJs() {
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
