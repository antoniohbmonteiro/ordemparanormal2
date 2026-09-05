import { ABILITY_ITEM_TYPE, AGENT_ACTOR_TYPE } from "../../config/system-config";
import {
  appendProfileAbilityGrant,
  type ProfileAbilityGrantData,
} from "../../documents/item/profile-ability-grant-data";
import { updateAgentProfileAbilityGrants } from "../../features/profiles/manage-agent-profile";

export interface ProfileAbilityGrantView {
  readonly uuid: string;
  readonly name: string;
  readonly img: string;
  readonly available: boolean;
}

export type ProfileAbilityGrantDropResult =
  | { readonly status: "accepted"; readonly grants: readonly ProfileAbilityGrantData[] }
  | { readonly status: "duplicate" }
  | { readonly status: "embedded" }
  | { readonly status: "wrong-type" };

export function evaluateProfileAbilityGrantDrop(
  source: foundry.documents.Item,
  current: readonly ProfileAbilityGrantData[],
): ProfileAbilityGrantDropResult {
  if (source.type !== ABILITY_ITEM_TYPE) return { status: "wrong-type" };
  if (source.isEmbedded) return { status: "embedded" };

  const grants = appendProfileAbilityGrant(current, source.uuid);
  return grants === current
    ? { status: "duplicate" }
    : { status: "accepted", grants };
}

export async function resolveProfileAbilityGrantView(
  grant: ProfileAbilityGrantData,
  resolve: (uuid: string) => Promise<unknown> = fromUuid,
): Promise<ProfileAbilityGrantView> {
  const document = await resolve(grant.uuid);
  const item = document as foundry.documents.Item | null;
  const available = item?.type === ABILITY_ITEM_TYPE && !item.isEmbedded;
  return {
    uuid: grant.uuid,
    name: available ? item.name : grant.uuid,
    img: available
      ? (item.img ?? "icons/svg/item-bag.svg")
      : "icons/svg/hazard.svg",
    available,
  };
}

export function removeProfileAbilityGrant(
  grants: readonly ProfileAbilityGrantData[],
  uuid: string,
): readonly ProfileAbilityGrantData[] {
  return grants.filter((grant) => grant.uuid !== uuid);
}

export async function persistProfileAbilityGrants(
  profile: foundry.documents.Item,
  grants: readonly ProfileAbilityGrantData[],
): Promise<void> {
  const actor = profile.actor;
  if (!actor) {
    await profile.update({ "system.abilityGrants": grants });
    return;
  }
  if (actor.type !== AGENT_ACTOR_TYPE) {
    throw new TypeError("Embedded Profiles require an Agent parent.");
  }
  await updateAgentProfileAbilityGrants(actor, profile, grants);
}
