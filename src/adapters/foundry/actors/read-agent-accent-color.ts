import { PROFILE_ITEM_TYPE } from "../../../config/system-config";
import {
  readStoredProfileAccentColor,
  resolveEffectiveAgentAccentColor,
  SYSTEM_DEFAULT_ACCENT_COLOR,
  type AccentColor,
} from "../../../core/actors/agent-accent-color";

function getOnlyAgentProfile(
  actor: foundry.documents.Actor,
): foundry.documents.Item | undefined {
  const profiles = [
    ...(actor.getEmbeddedCollection("Item") as Iterable<foundry.documents.Item>),
  ].filter((item) => item.type === PROFILE_ITEM_TYPE);
  return profiles.length === 1 ? profiles[0] : undefined;
}

export function readAgentProfileDefaultAccentColor(
  actor: foundry.documents.Actor,
): AccentColor {
  return (
    readStoredProfileAccentColor(getOnlyAgentProfile(actor)?.system) ??
    SYSTEM_DEFAULT_ACCENT_COLOR
  );
}

export function readAgentAccentColor(
  actor: foundry.documents.Actor,
): AccentColor {
  return resolveEffectiveAgentAccentColor(
    actor.system,
    getOnlyAgentProfile(actor)?.system,
  );
}
