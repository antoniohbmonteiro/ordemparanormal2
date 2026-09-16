import type { ZipPackageId } from "./known-adventure-sources";
import type { AdventureAct } from "./recognize-zip-source";

export type AdventureAssetKind = "map" | "portrait" | "token" | "handout" | "music";

export interface AdventureAssetReference {
  readonly id: string;
  readonly kind: AdventureAssetKind;
  readonly label: string;
  readonly source: {
    readonly act: AdventureAct;
    readonly originalEntryPath: string;
  };
}

export interface AdventureDefinition {
  readonly id: "playtest-alpha";
  readonly packageIds: Readonly<Record<AdventureAct, ZipPackageId>>;
  readonly assets: readonly AdventureAssetReference[];
}
