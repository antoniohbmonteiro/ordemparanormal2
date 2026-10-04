import { SYSTEM_ID } from "../config/system-config";
import { registerPoiInvestigationQuery } from "../adapters/foundry/points-of-interest/poi-investigation-query";
import { mutatePoi, reconcileScenePoiMembership, registerPoiRuntimeQueries } from "../adapters/foundry/points-of-interest/poi-runtime-queries";
import { readPoiRegionAssociation } from "../adapters/foundry/points-of-interest/poi-region-association";
import { registerInvestigationRuntimeQueries } from "../adapters/foundry/points-of-interest/investigation-runtime";
import { registerInvestigatePoiQuery } from "../adapters/foundry/points-of-interest/investigate-poi";
import { registerExaminePoiQuery } from "../adapters/foundry/points-of-interest/examine-poi";
import { registerCommitPoiExaminationQuery } from "../adapters/foundry/points-of-interest/commit-poi-examination";
import { registerInteractPoiQuery } from "../adapters/foundry/points-of-interest/interact-poi";
import { registerShareCandidatesQuery } from "../adapters/foundry/points-of-interest/investigation-share";
import { onInvestigationCheckMessageUpdated, registerInvestigationRequestQueries } from "../adapters/foundry/points-of-interest/investigation-requests";
import { registerEquipmentUseQuery } from "../adapters/foundry/equipment/execute-equipment-use";
import { registerEquipmentUsesAdjustmentQuery } from "../adapters/foundry/equipment/adjust-owned-equipment-uses";
import { registerEquipmentUsesMutationQuery } from "../adapters/foundry/equipment/mutate-owned-equipment-uses";
import { registerPoiToolUseQuery } from "../adapters/foundry/points-of-interest/use-poi-tool";

export function registerPoiInvestigation(): void {
  registerEquipmentUseQuery();
  registerEquipmentUsesAdjustmentQuery();
  registerEquipmentUsesMutationQuery();
  registerPoiToolUseQuery();
  registerPoiInvestigationQuery();
  registerPoiRuntimeQueries();
  registerInvestigationRuntimeQueries();
  registerInvestigatePoiQuery();
  registerExaminePoiQuery();
  registerCommitPoiExaminationQuery();
  registerInteractPoiQuery();
  registerShareCandidatesQuery();
  registerInvestigationRequestQueries();
  Hooks.on("updateChatMessage", (message: unknown) => {
    void onInvestigationCheckMessageUpdated(message as ChatMessage).catch(error => console.error(`${SYSTEM_ID} | Investigation Check update failed`, error));
  });
  const ensure = (region: unknown) => {
    if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return;
    const document = region as foundry.documents.RegionDocument;
    const itemUuid = readPoiRegionAssociation(document)?.itemUuid;
    const sceneId = document.parent?.id;
    if (!itemUuid || !sceneId) return;
    void mutatePoi({ action: "add", sceneId, itemUuid }).then(result => {
      if (!result.ok) ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.ScenePanel.MembershipFailed"));
    }).catch(error => {
      console.error(`${SYSTEM_ID} | Failed to add Region POI to Scene`, error);
      ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.ScenePanel.MembershipFailed"));
    });
  };
  Hooks.on("createRegion", ensure);
  Hooks.on("updateRegion", ensure);
  const reconcile = () => { void reconcileScenePoiMembership().catch(error => {
    console.error(`${SYSTEM_ID} | POI membership reconciliation failed`, error);
    ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.ScenePanel.MembershipFailed"));
  }); };
  Hooks.once("ready", reconcile);
  Hooks.on("updateUser", reconcile);
}
