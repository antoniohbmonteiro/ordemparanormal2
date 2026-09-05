import { AgentSheet } from "../applications/actor/agent-sheet";
import { ProfileItemSheet } from "../applications/item/profile-item-sheet";
import { AbilityItemSheet } from "../applications/item/ability-item-sheet";
import { OccupationItemSheet } from "../applications/item/occupation-item-sheet";
import { PointOfInterestItemSheet } from "../applications/item/point-of-interest-item-sheet";
import { EquipmentItemSheet } from "../applications/item/equipment-item-sheet";
import {
  ABILITY_ITEM_TYPE,
  AGENT_ACTOR_TYPE,
  EQUIPMENT_ITEM_TYPE,
  OCCUPATION_ITEM_TYPE,
  POINT_OF_INTEREST_ITEM_TYPE,
  PROFILE_ITEM_TYPE,
  SYSTEM_ID,
} from "../config/system-config";

export function registerSheets(): void {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor,
    SYSTEM_ID,
    AgentSheet,
    {
      types: [AGENT_ACTOR_TYPE],
      makeDefault: true,
      label: "ORDEMPARANORMAL2.Sheets.Agent",
      themes: null,
    },
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Item,
    SYSTEM_ID,
    ProfileItemSheet,
    {
      types: [PROFILE_ITEM_TYPE],
      makeDefault: true,
      label: "ORDEMPARANORMAL2.Sheets.Profile",
      themes: null,
    },
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Item,
    SYSTEM_ID,
    OccupationItemSheet,
    {
      types: [OCCUPATION_ITEM_TYPE],
      makeDefault: true,
      label: "ORDEMPARANORMAL2.Sheets.Occupation",
      themes: null,
    },
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Item,
    SYSTEM_ID,
    AbilityItemSheet,
    {
      types: [ABILITY_ITEM_TYPE],
      makeDefault: true,
      label: "ORDEMPARANORMAL2.Sheets.Ability",
      themes: null,
    },
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Item,
    SYSTEM_ID,
    PointOfInterestItemSheet,
    {
      types: [POINT_OF_INTEREST_ITEM_TYPE],
      makeDefault: true,
      label: "ORDEMPARANORMAL2.Sheets.PointOfInterest",
      themes: null,
    },
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Item,
    SYSTEM_ID,
    EquipmentItemSheet,
    {
      types: [EQUIPMENT_ITEM_TYPE],
      makeDefault: true,
      label: "ORDEMPARANORMAL2.Sheets.Equipment",
      themes: null,
    },
  );
}
