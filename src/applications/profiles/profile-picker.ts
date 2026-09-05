import {
  loadAvailableProfiles,
  resolveProfileCatalogSource,
} from "../../adapters/foundry/profiles/profile-catalog";
import {
  clearAgentProfile,
  getAgentProfile,
  setAgentProfile,
} from "../../features/profiles/manage-agent-profile";
import {
  confirmSingleItemRemoval,
  confirmSingleItemReplacement,
  SingleEmbeddedItemPicker,
  type SingleEmbeddedItemPickerDefinition,
} from "../items/single-embedded-item-picker";

const PROFILE_PICKER_DEFINITION: SingleEmbeddedItemPickerDefinition = {
  localizationRoot: "ORDEMPARANORMAL2.ProfilePicker",
  logLabel: "Profile",
  loadEntries: loadAvailableProfiles,
  resolveSource: resolveProfileCatalogSource,
  getCurrent: getAgentProfile,
  setCurrent: setAgentProfile,
  clearCurrent: clearAgentProfile,
};

export class ProfilePicker extends SingleEmbeddedItemPicker {
  constructor(actor: foundry.documents.Actor) {
    super(actor, PROFILE_PICKER_DEFINITION);
  }
}

export function confirmProfileReplacement(): Promise<boolean> {
  return confirmSingleItemReplacement(PROFILE_PICKER_DEFINITION);
}

export function confirmProfileRemoval(): Promise<boolean> {
  return confirmSingleItemRemoval(PROFILE_PICKER_DEFINITION);
}
