import { SYSTEM_ID } from "../config/system-config";
import { registerPoiInvestigationQuery } from "../adapters/foundry/points-of-interest/poi-investigation-query";
import { mutatePoi, reconcileScenePoiMembership, registerPoiRuntimeQueries } from "../adapters/foundry/points-of-interest/poi-runtime-queries";
import { readPoiRegionAssociation } from "../adapters/foundry/points-of-interest/poi-region-association";

export function registerPoiInvestigation(): void {
  registerPoiInvestigationQuery();
  registerPoiRuntimeQueries();
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
