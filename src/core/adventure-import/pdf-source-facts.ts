export interface PdfEncryptionFacts {
  readonly present: boolean;
  readonly v?: number;
  readonly r?: number;
  readonly length?: number;
  readonly permissions?: number;
  readonly streamFilter?: string;
  readonly stringFilter?: string;
}

export interface PdfPlaintextCatalogHints {
  readonly lang: string | null;
  readonly pageLayout: string | null;
  readonly hasStructTreeRoot: boolean;
  readonly hasOcProperties: boolean;
  readonly declaredPageCount: number | null;
}

export interface PdfPrePasswordFacts {
  readonly byteLength: number;
  readonly sha256: string;
  readonly pdfVersion: string | null;
  readonly encryption: PdfEncryptionFacts;
  readonly trailerId: readonly [string, string] | null;
  readonly plaintextCatalogHints: PdfPlaintextCatalogHints | null;
}

export interface PdfParsedFacts {
  readonly pageCount: number;
  readonly producer: string | null;
  readonly creator: string | null;
  readonly lang: string | null;
  readonly versionStampTag: string | null;
  readonly contentSignatureSha256: string | null;
}

export type PdfParseAttempt =
  | { readonly status: "not-attempted" }
  | { readonly status: "success"; readonly facts: PdfParsedFacts }
  | { readonly status: "password-required" }
  | { readonly status: "incorrect-password" }
  | { readonly status: "failed" };
