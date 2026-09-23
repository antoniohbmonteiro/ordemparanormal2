import { ACT_ONE_REQUIRED_PATHS, ACT_TWO_REQUIRED_PATHS } from "./known-zip-required-paths";

export type PdfEditionId = "playtest-alpha-v1.0" | "playtest-alpha-v1.1";
export type PdfDocumentVariant = "agents" | "survivors";
export type PdfDocumentId = "playtest-alpha-v1.0-agents" | "playtest-alpha-v1.1-agents" | "playtest-alpha-v1.1-survivors";

export type ZipPackageId = "ato-i-extras" | "ato-ii-extras";

export const ZIP_PACKAGE_BY_ACT = {
  actOne: "ato-i-extras",
  actTwo: "ato-ii-extras",
} as const satisfies Record<"actOne" | "actTwo", ZipPackageId>;

export interface KnownPdfEncryptionProfile {
  readonly v: number;
  readonly r: number;
  readonly length: number;
  readonly streamFilter: string;
  readonly stringFilter: string;
}

export interface KnownPdfStructuralDescriptor {
  readonly producer?: string;
  readonly creator?: string;
  readonly lang?: string;
  readonly versionStampPattern?: RegExp;
  readonly pageCount?: number;
}

export interface KnownPdfEdition {
  readonly edition: PdfEditionId;
  readonly variant: PdfDocumentVariant;
  readonly supportedActs: readonly ("actOne" | "actTwo")[];
  readonly sha256Hashes: readonly string[];
  readonly encryptionProfile?: KnownPdfEncryptionProfile;
  readonly structural: KnownPdfStructuralDescriptor;
  readonly contentSignatureSha256?: string;
}

export interface ZipContentAnchor {
  readonly path: string;
  readonly uncompressedSize: number;
  readonly crc32: number;
}

export interface ZipIdentitySignature {
  readonly structuralManifestHash: string;
  readonly expectedFileCount: number;
  readonly contentManifestHash?: string;
}

export interface ZipSupplementalFile extends ZipContentAnchor {
  readonly contentSha256: string;
}

export interface KnownZipPackage {
  readonly fingerprintHashes: readonly string[];
  readonly structuralManifestHash?: string;
  readonly expectedFileCount?: number;
  readonly anchors?: readonly [ZipContentAnchor, ZipContentAnchor, ZipContentAnchor];
  readonly identity?: ZipIdentitySignature;
  readonly requiredPaths?: readonly string[];
  readonly supplemental?: readonly ZipSupplementalFile[];
  readonly logicalRootPrefix?: string;
}

export const KNOWN_PDF_EDITIONS: Record<PdfDocumentId, KnownPdfEdition> = {
  "playtest-alpha-v1.1-agents": {
    edition: "playtest-alpha-v1.1", variant: "agents", supportedActs: ["actOne", "actTwo"],
    sha256Hashes: ["f51bf5de8a94c6fd38d92069a67e384f11c6bc989c13a5a08f297b88075727da"],
    contentSignatureSha256: "bdee1ce4fba3281565e2f62ec3f5fdb8cf29578b01da36f715a3adb3d313d07b",
    structural: {
      producer: "Adobe PDF Library 18.0",
      creator: "Adobe InDesign 21.5 (Windows)",
      lang: "pt-BR",
      versionStampPattern: /Pacote\s*#\d+\s*\|[^|]*\|\s*v1\.1\b/,
      pageCount: 104,
    },
  },
  "playtest-alpha-v1.0-agents": {
    edition: "playtest-alpha-v1.0", variant: "agents", supportedActs: ["actOne", "actTwo"],
    sha256Hashes: [
      "697f767ffabe1cfa8b06fbc41bd12f7c29bbc1b9775f6663e0ec4950c31d8c95",
      "4867109f62bab4ee95fbfcd81166a43f6ef5c5a0534ab8aabc50cf8531450d38",
    ],
    contentSignatureSha256: "1a52a85b71e22c5e87c85a87a24efeb169d33f6b5f4fee45a2a70e8814159e1b",
    encryptionProfile: {
      v: 5,
      r: 6,
      length: 256,
      streamFilter: "StdCF",
      stringFilter: "StdCF",
    },
    structural: {
      producer: "Adobe PDF Library 18.0",
      creator: "Adobe InDesign 21.5 (Windows)",
      lang: "pt-BR",
      versionStampPattern: /Pacote\s*#\d+\s*\|[^|]*\|\s*v1\.0\b/,
      pageCount: 103,
    },
  },
  "playtest-alpha-v1.1-survivors": {
    edition: "playtest-alpha-v1.1", variant: "survivors", supportedActs: ["actOne"],
    sha256Hashes: ["6b821c7118d31304273c085c53fc18e7f477548bd0bf781663b9e10b9fd82fa1"],
    contentSignatureSha256: "55eaf86fa6d9125b50ee59c4dde79600d542c691642781c2d17065227d0639f9",
    structural: { versionStampPattern: /Pacote\s*#\d+\s*\|[^|]*\|\s*v1\.1\b/, pageCount: 66 },
  },
};

export const KNOWN_ZIP_PACKAGES: Record<ZipPackageId, KnownZipPackage> = {
  "ato-i-extras": {
    fingerprintHashes: ["0fbb4e2b4d1e0f4db5a4ecd9adc2fae8cb5d4dae0f30624e404a525eaddbff3b"],
    structuralManifestHash: "0fbb4e2b4d1e0f4db5a4ecd9adc2fae8cb5d4dae0f30624e404a525eaddbff3b",
    expectedFileCount: 43,
    anchors: [
      { path: "Mapas/Mapa 01 - O Porão.jpg", uncompressedSize: 5982803, crc32: 1772020999 },
      { path: "Tokens/Token - Alan.png", uncompressedSize: 1296915, crc32: 3142580317 },
      { path: "Handouts/Handout 01 - Conversa Eloísa.png", uncompressedSize: 588767, crc32: 1467511417 },
    ],
    identity: { structuralManifestHash: "0fbb4e2b4d1e0f4db5a4ecd9adc2fae8cb5d4dae0f30624e404a525eaddbff3b", expectedFileCount: 43,
      contentManifestHash: "9657427c66b538a9a43870c71cf54adf94912c1376dc7e022218260ccc9f5480" },
    requiredPaths: ACT_ONE_REQUIRED_PATHS,
    logicalRootPrefix: "Arquivos para o público - Ato I",
  },
  "ato-ii-extras": {
    fingerprintHashes: [
      "97793e51f2faec236f830787ac8ea0c53627e4f87ed844de4ef3aaa781d696ff",
      "ed97c8afedd5b1dc3c0dd2bd64f27a55dcfb07cc07ffa3841b45e3e52be32d48",
    ],
    structuralManifestHash: "97793e51f2faec236f830787ac8ea0c53627e4f87ed844de4ef3aaa781d696ff",
    expectedFileCount: 32,
    anchors: [
      { path: "Mapa/Mapa 01 - O Porão.jpg", uncompressedSize: 7838886, crc32: 3567168012 },
      { path: "Tokens/Token - Val.png", uncompressedSize: 1302736, crc32: 1202914750 },
      { path: "Handouts/Handout 02A - Laser Porão.jpg", uncompressedSize: 2534382, crc32: 3561832227 },
    ],
    identity: { structuralManifestHash: "ed97c8afedd5b1dc3c0dd2bd64f27a55dcfb07cc07ffa3841b45e3e52be32d48", expectedFileCount: 29,
      contentManifestHash: "2b75b441cdd42bd6690788d6fb55450fd40d9596c71f2c11c9af3e9296c151b6" },
    requiredPaths: ACT_TWO_REQUIRED_PATHS,
    supplemental: [
      { path: "Handouts/Audio EMF 1.mp3", uncompressedSize: 194890, crc32: 1302877751, contentSha256: "47631866b33e2e835df4371d1d01d977f0b66d29d6118227bfe662c4c975a535" },
      { path: "Handouts/Audio EMF 2.mp3", uncompressedSize: 237257, crc32: 1112325967, contentSha256: "ef1cc3cfb8236ad56653f0b4b806d74e0b305ab45d2deee5ed404fbf98502fb2" },
      { path: "Handouts/Audio EMF 3.mp3", uncompressedSize: 184234, crc32: 3992616383, contentSha256: "ef74a6d8fb7c4a69aad03c8ad418df0af69789879d9fd9d6a7ec5a53aed36153" },
    ],
  },
};
