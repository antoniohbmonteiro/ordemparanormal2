import {
  SYSTEM_ID,
  TILE_INTERACTION_FLAG,
} from "../../../config/system-config";

export interface TileInteractionConfig {
  readonly enabled: boolean;
  readonly wallIds: readonly string[];
  readonly tileIds: readonly string[];
}

export const TILE_INTERACTION_FLAG_PATH =
  `flags.${SYSTEM_ID}.${TILE_INTERACTION_FLAG}` as const;

export const EMPTY_TILE_INTERACTION_CONFIG: TileInteractionConfig = Object.freeze({
  enabled: false,
  wallIds: Object.freeze([]),
  tileIds: Object.freeze([]),
});

function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(
    value.filter((entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0),
  )];
}

export function parseTileInteractionConfig(
  value: unknown,
): TileInteractionConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as {
    readonly enabled?: unknown;
    readonly wallIds?: unknown;
    readonly tileIds?: unknown;
  };
  if (typeof source.enabled !== "boolean") return null;
  const wallIds = parseIds(source.wallIds);
  const tileIds = parseIds(source.tileIds);
  if (!wallIds || !tileIds) return null;
  return { enabled: source.enabled, wallIds, tileIds };
}

export function readTileInteractionConfig(
  tile: { getFlag(scope: string, key: string): unknown },
): TileInteractionConfig | null {
  const value = tile.getFlag(SYSTEM_ID, TILE_INTERACTION_FLAG);
  if (value === undefined) return EMPTY_TILE_INTERACTION_CONFIG;
  return parseTileInteractionConfig(value);
}

export function buildTileInteractionFlagUpdate(
  config: TileInteractionConfig,
): Record<string, unknown> {
  const operators = foundry.data.operators;
  if (!config.enabled && config.wallIds.length === 0 && config.tileIds.length === 0) {
    return { [TILE_INTERACTION_FLAG_PATH]: new operators.ForcedDeletion() };
  }
  return {
    [TILE_INTERACTION_FLAG_PATH]: operators.ForcedReplacement.create({
      enabled: config.enabled,
      wallIds: [...config.wallIds],
      tileIds: [...config.tileIds],
    }),
  };
}
