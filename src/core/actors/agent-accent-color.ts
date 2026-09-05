export const SYSTEM_DEFAULT_ACCENT_COLOR = "#7F252B" as const;

export type AccentColor = `#${string}`;

const ACCENT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const CANONICAL_ACCENT_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeAccentColor(value: unknown): AccentColor | null {
  if (typeof value !== "string" || !ACCENT_COLOR_PATTERN.test(value)) {
    return null;
  }

  return value.toUpperCase() as AccentColor;
}

export function isCanonicalAccentColor(value: unknown): value is AccentColor {
  return (
    typeof value === "string" && CANONICAL_ACCENT_COLOR_PATTERN.test(value)
  );
}

export function readStoredAgentAccentColor(system: unknown): AccentColor | null {
  if (!isRecord(system) || !isRecord(system.appearance)) return null;
  return normalizeAccentColor(system.appearance.accentColor);
}

export function readStoredProfileAccentColor(
  system: unknown,
): AccentColor | null {
  if (!isRecord(system)) return null;
  return normalizeAccentColor(system.accentColor);
}

export function resolveEffectiveAgentAccentColor(
  agentSystem: unknown,
  profileSystem?: unknown,
): AccentColor {
  return (
    readStoredAgentAccentColor(agentSystem) ??
    readStoredProfileAccentColor(profileSystem) ??
    SYSTEM_DEFAULT_ACCENT_COLOR
  );
}
