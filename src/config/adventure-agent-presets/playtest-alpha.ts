import { SKILL_DEFINITIONS } from "../skills";
import { validateAdventureAgentData, type AdventureAgentPreset } from "../../core/adventure-import/adventure-agent-data";
import agent01 from "./playtest-alpha/act-one/agent-01.json";
import agent02 from "./playtest-alpha/act-one/agent-02.json";
import agent03 from "./playtest-alpha/act-one/agent-03.json";
import agent04 from "./playtest-alpha/act-one/agent-04.json";
import agent05 from "./playtest-alpha/act-one/agent-05.json";
import agent06 from "./playtest-alpha/act-two/agent-06.json";
import agent07 from "./playtest-alpha/act-two/agent-07.json";
import agent08 from "./playtest-alpha/act-two/agent-08.json";
import agent09 from "./playtest-alpha/act-two/agent-09.json";
import agent10 from "./playtest-alpha/act-two/agent-10.json";

export const PLAYTEST_ALPHA_PRESET_REVISION = 2;
export type PlaytestAlphaAgentPreset = AdventureAgentPreset<typeof SKILL_DEFINITIONS>;
const data: readonly unknown[] = [agent01, agent02, agent03, agent04, agent05, agent06, agent07, agent08, agent09, agent10];
export const PLAYTEST_ALPHA_AGENT_PRESETS: readonly PlaytestAlphaAgentPreset[] = data.map(value => {
  validateAdventureAgentData(value, SKILL_DEFINITIONS);
  return value;
});
if (new Set(PLAYTEST_ALPHA_AGENT_PRESETS.map(p => p.key)).size !== data.length) throw new Error("Duplicate Agent presets");
