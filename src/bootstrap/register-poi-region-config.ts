import { renderPoiRegionConfig } from "../adapters/foundry/points-of-interest/poi-region-config";

export function registerPoiRegionConfig(): void {
  Hooks.on("renderRegionConfig", renderPoiRegionConfig);
}
