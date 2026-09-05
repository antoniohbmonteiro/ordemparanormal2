import {
  ABILITY_ITEM_TYPE,
  AGENT_ACTOR_TYPE,
  PROFILE_ITEM_TYPE,
} from "../../config/system-config";
import {
  createAbilitySnapshot,
  readOwnedAbilitySourceUuid,
  readProfileGrantedAbilityFlag,
  resolveAbilityGrantSources,
} from "../../adapters/foundry/abilities/ability-sources";
import {
  readProfileAbilityGrants,
  uniqueProfileAbilityGrants,
  type ProfileAbilityGrantData,
} from "../../documents/item/profile-ability-grant-data";
import {
  normalizeAccentColor,
  readStoredAgentAccentColor,
  readStoredProfileAccentColor,
  resolveEffectiveAgentAccentColor,
  SYSTEM_DEFAULT_ACCENT_COLOR,
  type AccentColor,
} from "../../core/actors/agent-accent-color";

export interface ProfileItemSnapshot {
  readonly name: string;
  readonly img: string;
  readonly type: typeof PROFILE_ITEM_TYPE;
  readonly system: {
    readonly accentColor?: AccentColor;
    readonly abilityGrants: readonly ProfileAbilityGrantData[];
  };
}

export class AgentProfileConflictError extends Error {
  constructor(count: number) {
    super(`Agent owns ${count} Profile Items; expected at most one.`);
    this.name = "AgentProfileConflictError";
  }
}

export class InvalidProfileSourceError extends Error {
  constructor() {
    super("The selected Item is not a valid Profile source.");
    this.name = "InvalidProfileSourceError";
  }
}

export class InvalidProfileAccentColorError extends Error {
  constructor() {
    super("Profile accent color must use canonical #RRGGBB format.");
    this.name = "InvalidProfileAccentColorError";
  }
}

function embeddedItems(
  actor: foundry.documents.Actor,
): foundry.documents.Item[] {
  return [
    ...(actor.getEmbeddedCollection("Item") as Iterable<foundry.documents.Item>),
  ];
}

export function getAgentProfileItems(
  actor: foundry.documents.Actor,
): foundry.documents.Item[] {
  return embeddedItems(actor).filter(
    (item) => item.type === PROFILE_ITEM_TYPE,
  );
}

export function getAgentProfile(
  actor: foundry.documents.Actor,
): foundry.documents.Item | null {
  const profiles = getAgentProfileItems(actor);

  if (profiles.length > 1) {
    throw new AgentProfileConflictError(profiles.length);
  }

  return profiles[0] ?? null;
}

export function createProfileSnapshot(
  source: foundry.documents.Item,
): ProfileItemSnapshot {
  if (source.type !== PROFILE_ITEM_TYPE) {
    throw new InvalidProfileSourceError();
  }

  const accentColor = readStoredProfileAccentColor(source.system);

  return {
    name: source.name,
    img: source.img ?? "icons/svg/item-bag.svg",
    type: PROFILE_ITEM_TYPE,
    system: {
      ...(accentColor ? { accentColor } : {}),
      abilityGrants: uniqueProfileAbilityGrants(
        readProfileAbilityGrants(source.system),
      ).map(({ uuid }) => ({ uuid })),
    },
  };
}

async function materializeAgentAccentColor(
  actor: foundry.documents.Actor,
  accentColor: AccentColor,
): Promise<void> {
  await actor.update({ "system.appearance.accentColor": accentColor });
}

function assertAgent(actor: foundry.documents.Actor): void {
  if (actor.type !== AGENT_ACTOR_TYPE) {
    throw new TypeError("Profiles can only be assigned to Agent Actors.");
  }
}

export async function setAgentProfile(
  actor: foundry.documents.Actor,
  source: foundry.documents.Item,
): Promise<foundry.documents.Item> {
  assertAgent(actor);

  const current = getAgentProfile(actor);
  const snapshot = createProfileSnapshot(source);
  const grants = snapshot.system.abilityGrants;
  const resolvedSources = await resolveAbilityGrantSources(grants);
  const needsAccentSeed = readStoredAgentAccentColor(actor.system) === null;

  if (current && needsAccentSeed) {
    await materializeAgentAccentColor(
      actor,
      resolveEffectiveAgentAccentColor(actor.system, current.system),
    );
  }

  if (current?.id === source.id && source.actor === actor) {
    await reconcileAgentProfileAbilities(
      actor,
      current.id,
      grants,
      resolvedSources,
    );
    return current;
  }

  if (current?.id) {
    const reconciliation = prepareAgentProfileAbilityReconciliation(
      actor,
      current.id,
      grants,
      resolvedSources,
    );
    await createMissingProfileAbilities(actor, reconciliation);
    const [updated] = await actor.updateEmbeddedDocuments("Item", [
      { _id: current.id, ...snapshot },
    ]);

    if (!updated) throw new Error("Foundry did not return the updated Profile Item.");

    await deleteObsoleteProfileAbilities(actor, reconciliation);
    return updated as foundry.documents.Item;
  }

  const [created] = await actor.createEmbeddedDocuments("Item", [snapshot]);

  if (!created) throw new Error("Foundry did not return the created Profile Item.");

  const createdProfile = created as foundry.documents.Item;
  if (!createdProfile.id) {
    throw new Error("Foundry created a Profile Item without an id.");
  }
  await reconcileAgentProfileAbilities(
    actor,
    createdProfile.id,
    grants,
    resolvedSources,
  );
  if (needsAccentSeed) {
    await materializeAgentAccentColor(
      actor,
      snapshot.system.accentColor ?? SYSTEM_DEFAULT_ACCENT_COLOR,
    );
  }
  return createdProfile;
}

async function reconcileAgentProfileAbilities(
  actor: foundry.documents.Actor,
  profileItemId: string,
  grants: readonly ProfileAbilityGrantData[],
  resolvedSources?: readonly foundry.documents.Item[],
): Promise<void> {
  const uniqueGrants = uniqueProfileAbilityGrants(grants);
  const sources =
    resolvedSources ?? (await resolveAbilityGrantSources(uniqueGrants));
  const reconciliation = prepareAgentProfileAbilityReconciliation(
    actor,
    profileItemId,
    uniqueGrants,
    sources,
  );
  await createMissingProfileAbilities(actor, reconciliation);
  await deleteObsoleteProfileAbilities(actor, reconciliation);
}

interface ProfileAbilityReconciliation {
  readonly missingSnapshots: ReturnType<typeof createAbilitySnapshot>[];
  readonly obsoleteIds: string[];
}

function prepareAgentProfileAbilityReconciliation(
  actor: foundry.documents.Actor,
  profileItemId: string,
  uniqueGrants: readonly ProfileAbilityGrantData[],
  sources: readonly foundry.documents.Item[],
): ProfileAbilityReconciliation {
  const resolvedGrants = uniqueGrants.map((grant, index) => ({
    grant,
    source: sources[index],
  }));
  const desiredUuids = new Set(uniqueGrants.map(({ uuid }) => uuid));
  const abilities = embeddedItems(actor).filter(
    (item) => item.type === ABILITY_ITEM_TYPE,
  );
  const managedByUuid = new Map<string, foundry.documents.Item>();

  for (const ability of abilities) {
    const grant = readProfileGrantedAbilityFlag(ability);
    if (grant?.profileItemId === profileItemId) {
      managedByUuid.set(grant.abilityUuid, ability);
    }
  }

  const missingGrants = resolvedGrants.filter(({ grant }) => {
    if (managedByUuid.has(grant.uuid)) return false;
    return !abilities.some(
      (ability) => readOwnedAbilitySourceUuid(ability) === grant.uuid,
    );
  });

  const obsoleteIds = abilities.flatMap((ability) => {
    const grant = readProfileGrantedAbilityFlag(ability);
    return grant?.profileItemId === profileItemId &&
      !desiredUuids.has(grant.abilityUuid) &&
      ability.id
      ? [ability.id]
      : [];
  });

  return {
    missingSnapshots: missingGrants.map(({ grant, source }) =>
      createAbilitySnapshot(source, {
        profileItemId,
        abilityUuid: grant.uuid,
      }),
    ),
    obsoleteIds,
  };
}

async function createMissingProfileAbilities(
  actor: foundry.documents.Actor,
  reconciliation: ProfileAbilityReconciliation,
): Promise<void> {
  if (reconciliation.missingSnapshots.length > 0) {
    await actor.createEmbeddedDocuments("Item", reconciliation.missingSnapshots);
  }
}

async function deleteObsoleteProfileAbilities(
  actor: foundry.documents.Actor,
  reconciliation: ProfileAbilityReconciliation,
): Promise<void> {
  if (reconciliation.obsoleteIds.length > 0) {
    await actor.deleteEmbeddedDocuments("Item", reconciliation.obsoleteIds);
  }
}

export async function updateAgentProfileAbilityGrants(
  actor: foundry.documents.Actor,
  profile: foundry.documents.Item,
  abilityGrants: readonly ProfileAbilityGrantData[],
): Promise<foundry.documents.Item> {
  assertAgent(actor);
  if (
    profile.type !== PROFILE_ITEM_TYPE ||
    profile.actor !== actor ||
    !profile.id
  ) {
    throw new InvalidProfileSourceError();
  }

  const grants = uniqueProfileAbilityGrants(abilityGrants);
  const resolvedSources = await resolveAbilityGrantSources(grants);
  const reconciliation = prepareAgentProfileAbilityReconciliation(
    actor,
    profile.id,
    grants,
    resolvedSources,
  );
  await createMissingProfileAbilities(actor, reconciliation);
  const [updated] = await actor.updateEmbeddedDocuments("Item", [
    { _id: profile.id, "system.abilityGrants": grants },
  ]);
  if (!updated) {
    throw new Error("Foundry did not return the updated Profile Item.");
  }

  await deleteObsoleteProfileAbilities(actor, reconciliation);
  return updated as foundry.documents.Item;
}

export async function clearAgentProfile(
  actor: foundry.documents.Actor,
): Promise<void> {
  assertAgent(actor);

  const current = getAgentProfile(actor);

  if (!current?.id) return;
  if (readStoredAgentAccentColor(actor.system) === null) {
    await materializeAgentAccentColor(
      actor,
      resolveEffectiveAgentAccentColor(actor.system, current.system),
    );
  }
  const grantedAbilityIds = embeddedItems(actor).flatMap((item) => {
    if (item.type !== ABILITY_ITEM_TYPE) return [];
    const grant = readProfileGrantedAbilityFlag(item);
    return grant?.profileItemId === current.id && item.id ? [item.id] : [];
  });

  await actor.deleteEmbeddedDocuments("Item", [
    current.id,
    ...grantedAbilityIds,
  ]);
}

export async function updateProfileAccentColor(
  profile: foundry.documents.Item,
  input: unknown,
): Promise<void> {
  if (profile.type !== PROFILE_ITEM_TYPE) {
    throw new InvalidProfileSourceError();
  }

  const accentColor = normalizeAccentColor(input);
  if (!accentColor) throw new InvalidProfileAccentColorError();

  const actor = profile.actor;
  if (actor?.type === AGENT_ACTOR_TYPE) {
    const current = getAgentProfile(actor);
    if (current?.id !== profile.id) throw new InvalidProfileSourceError();

    if (readStoredAgentAccentColor(actor.system) === null) {
      await materializeAgentAccentColor(
        actor,
        resolveEffectiveAgentAccentColor(actor.system, profile.system),
      );
    }
  }

  await profile.update({ "system.accentColor": accentColor });
}
