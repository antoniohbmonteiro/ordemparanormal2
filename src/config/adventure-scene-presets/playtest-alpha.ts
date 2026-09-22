import basement from "./playtest-alpha/act-one/basement.json";
import actTwoBasement from "./playtest-alpha/act-two/basement.json";
import { validateAdventureSceneData, type AdventureScenePreset } from "../../core/adventure-import/adventure-scene-data";

const data: readonly unknown[] = [basement, actTwoBasement];
export const PLAYTEST_ALPHA_SCENE_PRESETS: readonly AdventureScenePreset[] = data.map(value => {
  validateAdventureSceneData(value);
  return value;
});
if (new Set(PLAYTEST_ALPHA_SCENE_PRESETS.map(p => p.id)).size !== data.length) throw new Error("Duplicate Scene presets");
