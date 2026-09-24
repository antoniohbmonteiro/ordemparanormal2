import characters from "./playtest-alpha/act-one-characters.json";
import actOneMap from "./playtest-alpha/act-one-map.json";
import actTwoMap from "./playtest-alpha/act-two-map.json";
import { validateAdventurePoiData, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";

export const PLAYTEST_ALPHA_POI_PRESET_REVISION = 2;
const data: readonly unknown[] = [...characters, ...actOneMap, ...actTwoMap];
export const PLAYTEST_ALPHA_POI_PRESETS: readonly AdventurePoiPreset[] = data.map(value => {
  validateAdventurePoiData(value);
  return value;
});
if (new Set(PLAYTEST_ALPHA_POI_PRESETS.map(preset => preset.id)).size !== data.length) {
  throw new Error("Duplicate Point of Interest presets");
}
