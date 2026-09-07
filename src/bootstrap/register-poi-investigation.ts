import { registerPoiInvestigationQuery } from "../adapters/foundry/points-of-interest/poi-investigation-query";
import { POI_INFORMATION_REVEAL_FLAG_PATH } from "../adapters/foundry/points-of-interest/poi-information-reveal-state";
import { refreshInvestigationApplication } from "../applications/points-of-interest/investigation-application";

/** Wires the sanitized query and replicated-state invalidation for open views. */
export function registerPoiInvestigation(): void {
  registerPoiInvestigationQuery();
  Hooks.on("updateRegion", (region: unknown, changes: unknown) => {
    if (
      !changes
      || typeof changes !== "object"
      || !foundry.utils.hasProperty(changes, POI_INFORMATION_REVEAL_FLAG_PATH)
    ) return;
    const document = region as {
      readonly id?: string | null;
      readonly parent?: { readonly id?: string | null } | null;
    };
    const sceneId = document.parent?.id;
    const regionId = document.id;
    if (sceneId && regionId) refreshInvestigationApplication(sceneId, regionId);
  });
}
