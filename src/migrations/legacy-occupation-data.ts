import {
  CURRENT_DATA_MIGRATION_VERSION,
  LEGACY_OCCUPATION_FLAG,
  SYSTEM_ID,
} from "../config/system-config";

export interface LegacyOccupationData {
  readonly value: string;
  readonly migrationVersion: typeof CURRENT_DATA_MIGRATION_VERSION;
}

export const LEGACY_OCCUPATION_FLAG_PATH =
  `flags.${SYSTEM_ID}.${LEGACY_OCCUPATION_FLAG}` as const;

export function createLegacyOccupationData(
  value: string,
): LegacyOccupationData {
  return { value, migrationVersion: CURRENT_DATA_MIGRATION_VERSION };
}

export function readLegacyOccupationData(
  value: unknown,
): LegacyOccupationData | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<LegacyOccupationData>;
  return typeof candidate.value === "string" &&
    candidate.migrationVersion === CURRENT_DATA_MIGRATION_VERSION
    ? { value: candidate.value, migrationVersion: candidate.migrationVersion }
    : null;
}
