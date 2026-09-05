import type { AccentColor } from "../../core/actors/agent-accent-color";

export interface ProfileAbilityGrantData {
  readonly uuid: string;
}

export interface ProfileSystemData {
  readonly accentColor?: AccentColor;
  readonly abilityGrants: readonly ProfileAbilityGrantData[];
}

export function readProfileAbilityGrants(
  system: unknown,
): readonly ProfileAbilityGrantData[] {
  if (!system || typeof system !== "object") return [];

  const abilityGrants = (system as { readonly abilityGrants?: unknown })
    .abilityGrants;
  if (!Array.isArray(abilityGrants)) return [];

  return abilityGrants.flatMap((grant) => {
    if (!grant || typeof grant !== "object") return [];
    const uuid = (grant as { readonly uuid?: unknown }).uuid;
    return typeof uuid === "string" && uuid.length > 0 ? [{ uuid }] : [];
  });
}

export function uniqueProfileAbilityGrants(
  grants: readonly ProfileAbilityGrantData[],
): readonly ProfileAbilityGrantData[] {
  const seen = new Set<string>();
  return grants.filter(({ uuid }) => {
    if (seen.has(uuid)) return false;
    seen.add(uuid);
    return true;
  });
}

export function appendProfileAbilityGrant(
  grants: readonly ProfileAbilityGrantData[],
  uuid: string,
): readonly ProfileAbilityGrantData[] {
  return grants.some((grant) => grant.uuid === uuid)
    ? grants
    : [...grants, { uuid }];
}
