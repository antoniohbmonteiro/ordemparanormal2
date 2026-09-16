import { SKILL_DEFINITIONS } from "../skills";
import { validateAdventureAgentData, type AdventureAgentPreset } from "../../core/adventure-import/adventure-agent-data";
import kenia from "./playtest-alpha/act-one/kenia.json";
import edgar from "./playtest-alpha/act-one/edgar.json";
import alan from "./playtest-alpha/act-one/alan.json";
import eloisa from "./playtest-alpha/act-one/eloisa.json";
import victor from "./playtest-alpha/act-one/victor.json";
import val from "./playtest-alpha/act-two/val.json";
import raven from "./playtest-alpha/act-two/raven.json";
import antonio from "./playtest-alpha/act-two/antonio.json";
import amanda from "./playtest-alpha/act-two/amanda.json";
import heitor from "./playtest-alpha/act-two/heitor.json";

export const PLAYTEST_ALPHA_PRESET_REVISION = 1;
export type PlaytestAlphaAgentPreset = AdventureAgentPreset<typeof SKILL_DEFINITIONS>;
const data: readonly unknown[] = [kenia, edgar, alan, eloisa, victor, val, raven, antonio, amanda, heitor];
export const PLAYTEST_ALPHA_AGENT_PRESETS: readonly PlaytestAlphaAgentPreset[] = data.map(value => {
  validateAdventureAgentData(value, SKILL_DEFINITIONS);
  return value;
});
if (new Set(PLAYTEST_ALPHA_AGENT_PRESETS.map(p => p.id)).size !== data.length) throw new Error("Duplicate Agent presets");
