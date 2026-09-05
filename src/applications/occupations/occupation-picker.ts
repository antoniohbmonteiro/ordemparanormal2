import {
  loadAvailableOccupations,
  resolveOccupationCatalogSource,
} from "../../adapters/foundry/occupations/occupation-catalog";
import {
  clearAgentOccupation,
  getAgentOccupation,
  setAgentOccupation,
} from "../../features/occupations/manage-agent-occupation";
import {
  confirmSingleItemRemoval,
  confirmSingleItemReplacement,
  SingleEmbeddedItemPicker,
  type SingleEmbeddedItemPickerDefinition,
} from "../items/single-embedded-item-picker";

const OCCUPATION_PICKER_DEFINITION: SingleEmbeddedItemPickerDefinition = {
  localizationRoot: "ORDEMPARANORMAL2.OccupationPicker",
  logLabel: "Occupation",
  loadEntries: loadAvailableOccupations,
  resolveSource: resolveOccupationCatalogSource,
  getCurrent: getAgentOccupation,
  setCurrent: setAgentOccupation,
  clearCurrent: clearAgentOccupation,
};

export class OccupationPicker extends SingleEmbeddedItemPicker {
  constructor(actor: foundry.documents.Actor) {
    super(actor, OCCUPATION_PICKER_DEFINITION);
  }
}

export function confirmOccupationReplacement(): Promise<boolean> {
  return confirmSingleItemReplacement(OCCUPATION_PICKER_DEFINITION);
}

export function confirmOccupationRemoval(): Promise<boolean> {
  return confirmSingleItemRemoval(OCCUPATION_PICKER_DEFINITION);
}
