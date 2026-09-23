import type { PoiSceneEntry } from "../../adapters/foundry/points-of-interest/poi-runtime-queries";
import type { PoiVisibility } from "../../adapters/foundry/points-of-interest/poi-runtime-state";

export interface PoiSceneRowView extends PoiSceneEntry {
  readonly visibilityLabel: string;
  readonly visibilityIcon: string;
  readonly locationLabel: string;
  readonly locationCount: number;
}

export function poiSceneRowView(
  entry: PoiSceneEntry,
  visibility: PoiVisibility | null,
  locationCount: number,
  localize: (key: string) => string,
  audience: "gm" | "player" = "player",
): PoiSceneRowView {
  const root = "ORDEMPARANORMAL2.PointOfInterest.ScenePanel";
  const mode = visibility?.mode;
  const visibilityKey = mode === "everyone" ? "VisibleEveryone"
    : mode === "users" ? "VisibleUsers" : mode === "hidden" ? "Hidden" : audience === "gm" ? "Unavailable" : "VisibleToYou";
  const visibilityIcon = mode === "hidden" ? "fa-eye-slash" : mode === "users" ? "fa-users" : "fa-eye";
  const locationKey = locationCount === 0 ? "NoLocation" : locationCount === 1 ? "OneLocation" : "ManyLocations";
  return {
    ...entry,
    visibilityLabel: localize(`${root}.${visibilityKey}`),
    visibilityIcon,
    locationLabel: locationCount > 1 ? `${locationCount} ${localize(`${root}.${locationKey}`)}` : localize(`${root}.${locationKey}`),
    locationCount,
  };
}
