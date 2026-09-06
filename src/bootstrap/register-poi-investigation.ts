import { registerPoiInvestigationQuery } from "../adapters/foundry/points-of-interest/poi-investigation-query";

/** Wires the GM-side query that serves the sanitized POI investigation projection. */
export function registerPoiInvestigation(): void {
  registerPoiInvestigationQuery();
}
