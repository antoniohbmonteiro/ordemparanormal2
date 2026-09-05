import { SYSTEM_ID } from "../../../config/system-config";

export const POI_SPIKE_FLAG = "poiCanvasSpike";

export interface PoiSpikePlacement {
  readonly itemUuid: string;
}

export function readPoiSpikePlacement(value: unknown): PoiSpikePlacement | null {
  if (typeof value !== "object" || value === null || !("itemUuid" in value)) {
    return null;
  }
  const { itemUuid } = value;
  if (typeof itemUuid !== "string") return null;
  // Only standalone world Items or canonical compendium Item UUIDs.
  if (!/^(?:Item\.[A-Za-z0-9]+|Compendium\.[^.\s]+\.[^.\s]+\.Item\.[A-Za-z0-9]+)$/.test(itemUuid)) {
    return null;
  }
  return { itemUuid };
}

export function createPoiSpikeRegionData(itemUuid: string) {
  if (!readPoiSpikePlacement({ itemUuid })) throw new Error("Invalid POI source UUID");
  return {
    name: "POI — teste de canvas",
    shapes: [{
      type: "polygon" as const,
      points: [0, 0, 300, 0, 300, 100, 100, 100, 100, 300, 0, 300],
      hole: false,
    }],
    restriction: { enabled: false },
    flags: { [SYSTEM_ID]: { [POI_SPIKE_FLAG]: { itemUuid } } },
  };
}
