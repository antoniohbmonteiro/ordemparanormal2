export type PdfEditionId = "playtest-alpha-v1.0" | "playtest-alpha-v1.1";

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
  readonly sha256: string;
  readonly encryptionProfile?: KnownPdfEncryptionProfile;
  readonly structural: KnownPdfStructuralDescriptor;
}

export interface KnownZipPackage {
  readonly fingerprintHash: string;
}

export const KNOWN_PDF_EDITIONS: Record<PdfEditionId, KnownPdfEdition> = {
  "playtest-alpha-v1.1": {
    sha256: "f51bf5de8a94c6fd38d92069a67e384f11c6bc989c13a5a08f297b88075727da",
    structural: {
      producer: "Adobe PDF Library 18.0",
      creator: "Adobe InDesign 21.5 (Windows)",
      lang: "pt-BR",
      versionStampPattern: /Pacote\s*#\d+\s*\|[^|]*\|\s*v1\.1\b/,
      pageCount: 104,
    },
  },
  "playtest-alpha-v1.0": {
    sha256: "697f767ffabe1cfa8b06fbc41bd12f7c29bbc1b9775f6663e0ec4950c31d8c95",
    encryptionProfile: {
      v: 5,
      r: 6,
      length: 256,
      streamFilter: "StdCF",
      stringFilter: "StdCF",
    },
    // Never decrypted during this step, so no verified producer/creator/lang/pageCount/
    // versionStampTag exists yet. Left empty on purpose rather than guessed — this
    // edition is only recognizable by hash until a maintainer decrypts it locally once
    // and fills these in with real, verified values.
    structural: {},
  },
};

export const KNOWN_ZIP_PACKAGES: Record<ZipPackageId, KnownZipPackage> = {
  "ato-i-extras": {
    fingerprintHash: "0fbb4e2b4d1e0f4db5a4ecd9adc2fae8cb5d4dae0f30624e404a525eaddbff3b",
  },
  "ato-ii-extras": {
    fingerprintHash: "97793e51f2faec236f830787ac8ea0c53627e4f87ed844de4ef3aaa781d696ff",
  },
};
