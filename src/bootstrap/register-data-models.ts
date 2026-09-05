import {
  ABILITY_ITEM_TYPE,
  AGENT_ACTOR_TYPE,
  EQUIPMENT_ITEM_TYPE,
  OCCUPATION_ITEM_TYPE,
  POINT_OF_INTEREST_ITEM_TYPE,
  PROFILE_ITEM_TYPE,
} from "../config/system-config";
import { AgentDataModel } from "../documents/actor/agent-data-model";
import { ProfileDataModel } from "../documents/item/profile-data-model";
import { AbilityDataModel } from "../documents/item/ability-data-model";
import { OccupationDataModel } from "../documents/item/occupation-data-model";
import { PointOfInterestDataModel } from "../documents/item/point-of-interest-data-model";
import { EquipmentDataModel } from "../documents/item/equipment-data-model";

export function registerDataModels(): void {
  CONFIG.Actor.dataModels[AGENT_ACTOR_TYPE] = AgentDataModel;
  CONFIG.Item.dataModels[PROFILE_ITEM_TYPE] = ProfileDataModel;
  CONFIG.Item.dataModels[OCCUPATION_ITEM_TYPE] = OccupationDataModel;
  CONFIG.Item.dataModels[ABILITY_ITEM_TYPE] = AbilityDataModel;
  CONFIG.Item.dataModels[POINT_OF_INTEREST_ITEM_TYPE] = PointOfInterestDataModel;
  CONFIG.Item.dataModels[EQUIPMENT_ITEM_TYPE] = EquipmentDataModel;
}
