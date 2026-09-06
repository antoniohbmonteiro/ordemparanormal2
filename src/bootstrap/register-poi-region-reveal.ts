import { renderPoiRegionRevealConfig } from "../adapters/foundry/points-of-interest/poi-region-reveal-config";

export function registerPoiRegionReveal(): void {
  Hooks.on("renderRegionConfig", renderPoiRegionRevealConfig);
}
