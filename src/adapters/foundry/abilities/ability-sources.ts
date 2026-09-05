import {
  ABILITY_ITEM_TYPE,
  SYSTEM_ID,
} from "../../../config/system-config";
import type { ProfileAbilityGrantData } from "../../../documents/item/profile-ability-grant-data";

export const ABILITY_SOURCE_UUID_FLAG = "sourceUuid" as const;
export const PROFILE_GRANT_FLAG = "profileGrant" as const;

export interface ProfileGrantedAbilityFlag {
  readonly profileItemId: string;
  readonly abilityUuid: string;
}

export interface AbilityItemSnapshot {
  readonly name: string;
  readonly img: string;
  readonly type: typeof ABILITY_ITEM_TYPE;
  readonly system: Record<string, unknown>;
  readonly effects: readonly Record<string, unknown>[];
  readonly flags: {
    readonly [SYSTEM_ID]: {
      readonly sourceUuid: string;
      readonly profileGrant?: ProfileGrantedAbilityFlag;
    };
  };
}

export class InvalidAbilityGrantError extends Error {
  constructor(
    readonly uuid: string,
    readonly reason: "missing" | "wrong-type" | "embedded",
  ) {
    super(`Ability grant ${uuid} is invalid: ${reason}.`);
    this.name = "InvalidAbilityGrantError";
  }
}

function readSystemFlags(item: foundry.documents.Item): Record<string, unknown> {
  const flags = (item as unknown as { readonly flags?: unknown }).flags;
  if (!flags || typeof flags !== "object") return {};
  const systemFlags = (flags as Record<string, unknown>)[SYSTEM_ID];
  return systemFlags && typeof systemFlags === "object"
    ? (systemFlags as Record<string, unknown>)
    : {};
}

export function readProfileGrantedAbilityFlag(
  item: foundry.documents.Item,
): ProfileGrantedAbilityFlag | null {
  const value = readSystemFlags(item)[PROFILE_GRANT_FLAG];
  if (!value || typeof value !== "object") return null;

  const flag = value as Partial<ProfileGrantedAbilityFlag>;
  return typeof flag.profileItemId === "string" &&
    flag.profileItemId.length > 0 &&
    typeof flag.abilityUuid === "string" &&
    flag.abilityUuid.length > 0
    ? {
        profileItemId: flag.profileItemId,
        abilityUuid: flag.abilityUuid,
      }
    : null;
}

export function readOwnedAbilitySourceUuid(
  item: foundry.documents.Item,
): string | null {
  const granted = readProfileGrantedAbilityFlag(item);
  if (granted) return granted.abilityUuid;

  const sourceUuid = readSystemFlags(item)[ABILITY_SOURCE_UUID_FLAG];
  if (typeof sourceUuid === "string" && sourceUuid.length > 0) {
    return sourceUuid;
  }

  const stats = (item as unknown as {
    readonly _stats?: {
      readonly compendiumSource?: unknown;
      readonly duplicateSource?: unknown;
    };
  })._stats;
  if (typeof stats?.compendiumSource === "string") {
    return stats.compendiumSource;
  }
  return typeof stats?.duplicateSource === "string"
    ? stats.duplicateSource
    : null;
}

export function createAbilitySnapshot(
  source: foundry.documents.Item,
  profileGrant?: ProfileGrantedAbilityFlag,
): AbilityItemSnapshot {
  if (source.type !== ABILITY_ITEM_TYPE) {
    throw new TypeError("The source Item is not an Ability.");
  }

  const serialized = source.toObject(false) as unknown as {
    readonly system: Record<string, unknown>;
    readonly effects?: readonly Record<string, unknown>[];
  };

  return {
    name: source.name,
    img: source.img ?? "icons/svg/item-bag.svg",
    type: ABILITY_ITEM_TYPE,
    system: foundry.utils.deepClone(serialized.system),
    effects: foundry.utils.deepClone(serialized.effects ?? []),
    flags: {
      [SYSTEM_ID]: {
        sourceUuid: profileGrant?.abilityUuid ?? source.uuid,
        ...(profileGrant ? { profileGrant } : {}),
      },
    },
  };
}

export async function resolveAbilityGrantSources(
  grants: readonly ProfileAbilityGrantData[],
): Promise<readonly foundry.documents.Item[]> {
  return Promise.all(
    grants.map(async ({ uuid }) => {
      const document = await fromUuid(uuid);
      if (!document) throw new InvalidAbilityGrantError(uuid, "missing");

      const item = document as unknown as foundry.documents.Item;
      if (item.type !== ABILITY_ITEM_TYPE) {
        throw new InvalidAbilityGrantError(uuid, "wrong-type");
      }
      if (item.isEmbedded) {
        throw new InvalidAbilityGrantError(uuid, "embedded");
      }
      return item;
    }),
  );
}
