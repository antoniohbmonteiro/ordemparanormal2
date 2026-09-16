import type { AdventureAssetLookup } from "../../adapters/foundry/adventure-asset-storage";
import type { AdventureDefinition, AdventureAssetReference } from "../../core/adventure-import/adventure-definition";
import { ZIP_PACKAGE_BY_ACT } from "../../core/adventure-import/known-adventure-sources";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import { safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";
import { adventureEntryLocation } from "./adventure-asset-layout";
import type { MaterializationResult } from "./materialize-adventure-assets";

export type AdventureAssetResolutionSource =
  | { readonly kind: "materialization"; readonly result: MaterializationResult }
  | { readonly kind: "worldStorage"; readonly lookup: AdventureAssetLookup };

export type AssetResolutionFailure = "unknown-id" | "invalid-reference" | "out-of-scope" | "missing-asset" | "browse-failed";

export class AssetResolutionError extends Error {
  constructor(readonly code: AssetResolutionFailure, readonly assetId: string, options?: ErrorOptions) {
    super(`Adventure asset ${assetId}: ${code}`, options);
    this.name = "AssetResolutionError";
  }
}

function materializationScope(result: MaterializationResult): readonly AdventureAct[] {
  if (!Array.isArray(result.materializedActs)
    || result.materializedActs.length === 0
    || new Set(result.materializedActs).size !== result.materializedActs.length
    || result.materializedActs.some((act) => act !== "actOne" && act !== "actTwo")) {
    throw new Error("MaterializationResult requires explicit materializedActs");
  }
  return result.materializedActs;
}

function assertValidReference(definition: AdventureDefinition, reference: AdventureAssetReference): void {
  const assetId = reference.id;
  try {
    const entry = safeZipEntryPath(reference.source.originalEntryPath);
    const act = reference.source.act;
    if (entry.isDirectory || (act !== "actOne" && act !== "actTwo")
      || definition.packageIds[act] !== ZIP_PACKAGE_BY_ACT[act]) {
      throw new Error("Invalid asset source");
    }
  } catch (cause) {
    throw new AssetResolutionError("invalid-reference", assetId, { cause });
  }
}

function referenceFor(definition: AdventureDefinition, assetId: string): AdventureAssetReference {
  const reference = definition.assets.find((asset) => asset.id === assetId);
  if (!reference) throw new AssetResolutionError("unknown-id", assetId);
  assertValidReference(definition, reference);
  return reference;
}

export async function resolveAdventureAsset(
  definition: AdventureDefinition, assetId: string, source: AdventureAssetResolutionSource,
): Promise<string> {
  const reference = referenceFor(definition, assetId);
  const { act, originalEntryPath } = reference.source;
  if (source.kind === "materialization") {
    if (!materializationScope(source.result).includes(act)) {
      throw new AssetResolutionError("out-of-scope", assetId);
    }
    const asset = source.result.assets.find((candidate) =>
      candidate.act === act && candidate.originalEntryPath === originalEntryPath
    );
    if (!asset) throw new AssetResolutionError("missing-asset", assetId);
    return asset.storedPath;
  }

  const { directory, basename } = adventureEntryLocation(source.lookup.worldId, act, originalEntryPath);
  let storedPath: string | null;
  try {
    storedPath = await source.lookup.findExisting(directory, basename);
  } catch (cause) {
    throw new AssetResolutionError("browse-failed", assetId, { cause });
  }
  if (storedPath === null) throw new AssetResolutionError("missing-asset", assetId);
  return storedPath;
}

export type DefinitionValidationCode =
  | AssetResolutionFailure | "duplicate-id" | "wrong-package";

export interface DefinitionValidationIssue {
  readonly code: DefinitionValidationCode;
  readonly assetId: string;
}

export async function validateAdventureDefinition(
  definition: AdventureDefinition,
  source: AdventureAssetResolutionSource,
  requestedActs: readonly AdventureAct[],
): Promise<readonly DefinitionValidationIssue[]> {
  const issues: DefinitionValidationIssue[] = [];
  const scope = source.kind === "materialization" ? materializationScope(source.result) : null;
  for (const act of requestedActs) {
    if (scope && !scope.includes(act)) issues.push({ code: "out-of-scope", assetId: act });
  }
  for (const act of ["actOne", "actTwo"] as const) {
    if (definition.packageIds[act] !== ZIP_PACKAGE_BY_ACT[act]) {
      issues.push({ code: "wrong-package", assetId: act });
    }
  }
  const seen = new Set<string>();
  for (const asset of definition.assets) {
    if (seen.has(asset.id)) issues.push({ code: "duplicate-id", assetId: asset.id });
    seen.add(asset.id);
    try {
      assertValidReference(definition, asset);
    } catch (error) {
      if (error instanceof AssetResolutionError) issues.push({ code: error.code, assetId: asset.id });
    }
    if (!requestedActs.includes(asset.source.act) || (scope && !scope.includes(asset.source.act))) continue;
    try {
      await resolveAdventureAsset(definition, asset.id, source);
    } catch (error) {
      if (error instanceof AssetResolutionError && error.code !== "invalid-reference") {
        issues.push({ code: error.code, assetId: asset.id });
      }
    }
  }
  return issues;
}
