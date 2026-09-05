import {
  AGENT_ACTOR_TYPE,
  OCCUPATION_ITEM_TYPE,
  PROFILE_ITEM_TYPE,
} from "../config/system-config";
import { getAgentOccupationItems } from "../features/occupations/manage-agent-occupation";
import { getAgentProfileItems } from "../features/profiles/manage-agent-profile";

export function canCreateUniqueAgentItem(
  itemType: string,
  parentType: string | undefined,
  existingCount: number,
): boolean {
  const uniqueType =
    itemType === PROFILE_ITEM_TYPE || itemType === OCCUPATION_ITEM_TYPE;
  return !(
    uniqueType &&
    parentType === AGENT_ACTOR_TYPE &&
    existingCount > 0
  );
}

export function registerUniqueAgentItemHooks(): void {
  Hooks.on("preCreateItem", (document) => {
    const item = document as unknown as foundry.documents.Item;
    const actor = item.actor;
    const existingCount = actor
      ? item.type === PROFILE_ITEM_TYPE
        ? getAgentProfileItems(actor).length
        : item.type === OCCUPATION_ITEM_TYPE
          ? getAgentOccupationItems(actor).length
          : 0
      : 0;
    if (canCreateUniqueAgentItem(item.type, actor?.type, existingCount)) return;

    const key =
      item.type === PROFILE_ITEM_TYPE
        ? "ORDEMPARANORMAL2.AgentSheet.Errors.ProfileAlreadySelected"
        : "ORDEMPARANORMAL2.AgentSheet.Errors.OccupationAlreadySelected";
    ui.notifications.error(game.i18n.localize(key));
    return false;
  });
}
