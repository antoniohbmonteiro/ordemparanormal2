import type {
  PdfEncryptionFacts,
  PdfPlaintextCatalogHints,
  PdfPrePasswordFacts,
} from "../../core/adventure-import/pdf-source-facts";

function findObjectBody(text: string, objectNumber: string, generation: string): string | null {
  const objStart = text.indexOf(`${objectNumber} ${generation} obj`);
  if (objStart === -1) return null;

  const bodyStart = objStart + `${objectNumber} ${generation} obj`.length;
  const endObjIndex = text.indexOf("endobj", bodyStart);
  if (endObjIndex === -1) return null;

  return text.slice(bodyStart, endObjIndex);
}

function readEncryptionFacts(text: string): PdfEncryptionFacts {
  const encryptRef = text.match(/\/Encrypt\s+(\d+)\s+(\d+)\s+R/);
  if (!encryptRef) return { present: false };

  const body = findObjectBody(text, encryptRef[1], encryptRef[2]);
  if (body === null) return { present: true };

  const v = body.match(/\/V\s+(\d+)/);
  const r = body.match(/\/R\s+(\d+)/);
  const length = body.match(/\/Length\s+(\d+)/);
  const permissions = body.match(/\/P\s+(-?\d+)/);
  const streamFilter = body.match(/\/StmF\s*\/(\w+)/);
  const stringFilter = body.match(/\/StrF\s*\/(\w+)/);

  return {
    present: true,
    ...(v ? { v: Number(v[1]) } : {}),
    ...(r ? { r: Number(r[1]) } : {}),
    ...(length ? { length: Number(length[1]) } : {}),
    ...(permissions ? { permissions: Number(permissions[1]) } : {}),
    ...(streamFilter ? { streamFilter: streamFilter[1] } : {}),
    ...(stringFilter ? { stringFilter: stringFilter[1] } : {}),
  };
}

function readTrailerId(text: string): readonly [string, string] | null {
  const match = text.match(/\/ID\s*\[\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\]/);
  return match ? [match[1], match[2]] : null;
}

function readPlaintextCatalogHints(text: string): PdfPlaintextCatalogHints | null {
  const rootRef = text.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
  if (!rootRef) return null;

  const catalogBody = findObjectBody(text, rootRef[1], rootRef[2]);
  if (catalogBody === null) return null;

  const lang = catalogBody.match(/\/Lang\s*\(([^)]*)\)/);
  const pageLayout = catalogBody.match(/\/PageLayout\s*\/(\w+)/);
  const hasStructTreeRoot = catalogBody.includes("/StructTreeRoot");
  const hasOcProperties = catalogBody.includes("/OCProperties");

  let declaredPageCount: number | null = null;
  const pagesRef = catalogBody.match(/\/Pages\s+(\d+)\s+(\d+)\s+R/);
  if (pagesRef) {
    const pagesBody = findObjectBody(text, pagesRef[1], pagesRef[2]);
    const count = pagesBody?.match(/\/Count\s+(\d+)/);
    if (count) declaredPageCount = Number(count[1]);
  }

  return {
    lang: lang ? lang[1] : null,
    pageLayout: pageLayout ? pageLayout[1] : null,
    hasStructTreeRoot,
    hasOcProperties,
    declaredPageCount,
  };
}

export function readPdfPrePasswordFacts(bytes: ArrayBuffer, sha256: string): PdfPrePasswordFacts {
  const text = new TextDecoder("latin1").decode(bytes);
  const versionMatch = text.slice(0, 1024).match(/%PDF-(\d\.\d)/);

  return {
    byteLength: bytes.byteLength,
    sha256,
    pdfVersion: versionMatch ? versionMatch[1] : null,
    encryption: readEncryptionFacts(text),
    trailerId: readTrailerId(text),
    plaintextCatalogHints: readPlaintextCatalogHints(text),
  };
}
