import { LEGACY_OCCUPATION_FLAG, SYSTEM_ID } from "../config/system-config";

const OCCUPATION_MIGRATION_VERSION = 1 as const;

export interface LegacyOccupationData {
  readonly value: string;
  readonly migrationVersion: typeof OCCUPATION_MIGRATION_VERSION;
}

export const LEGACY_OCCUPATION_FLAG_PATH =
  `flags.${SYSTEM_ID}.${LEGACY_OCCUPATION_FLAG}` as const;

export function createLegacyOccupationData(
  value: string,
): LegacyOccupationData {
  return { value, migrationVersion: OCCUPATION_MIGRATION_VERSION };
}

export function readLegacyOccupationData(
  value: unknown,
): LegacyOccupationData | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<LegacyOccupationData>;
  return typeof candidate.value === "string" &&
    candidate.migrationVersion === OCCUPATION_MIGRATION_VERSION
    ? { value: candidate.value, migrationVersion: candidate.migrationVersion }
    : null;
}
