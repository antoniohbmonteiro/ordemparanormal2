import { describe, expect, it } from "vitest";
import { SKILL_DEFINITIONS } from "../../config/skills";
import { PLAYTEST_ALPHA_AGENT_PRESETS as presets, PLAYTEST_ALPHA_PRESET_REVISION } from "../../config/adventure-agent-presets/playtest-alpha";
import { validateAdventureAgentData } from "./adventure-agent-data";

describe("Adventure Agent presets", () => {
  it("validates ten complete presets with schema and revision independent", () => {
    expect(PLAYTEST_ALPHA_PRESET_REVISION).toBe(2);
    expect(presets).toHaveLength(10);
    expect(new Set(presets.map(p => p.key)).size).toBe(10);
    expect(presets.every(p => !Object.hasOwn(p, "name") && !Object.hasOwn(p, "act"))).toBe(true);
    for (const p of presets) expect(() => validateAdventureAgentData(p, SKILL_DEFINITIONS)).not.toThrow();
  });
  it.each([null, {}, { ...presets[0], level: 11 }, { ...presets[0], level: 1.5 },
    { ...presets[0], schemaVersion: 1 }, { ...presets[0], resources: { healthMax: -1, determinationMax: 0 } },
    { ...presets[0], description: "forbidden" }, { ...presets[0], name: "forbidden" },
    { ...presets[0], abilityUuids: [presets[0].abilityUuids[0], presets[0].abilityUuids[0]] },
    { ...presets[0], token: { actorLink: true } }, { ...presets[0], attributes: { physical: 5, mind: 8, emotion: 4 } },
    { ...presets[0], skills: { ...presets[0].skills, acrobatics: 20 } },
    { ...presets[0], skills: { ...presets[0].skills, aptitude: { arts: 4 } } },
    { ...presets[0], resources: { healthMax: 1, determinationMax: 2, healthValue: 1 } },
    { ...presets[0], abilityUuids: ["Item.manual"] },
  ])("rejects incomplete, invalid or unknown data (%j)", value => {
    expect(() => validateAdventureAgentData(value, SKILL_DEFINITIONS)).toThrow();
  });
  it("requires every scalar skill", () => {
    const p = structuredClone(presets[0]) as unknown as Record<string, unknown>;
    delete (p.skills as Record<string, unknown>).acrobatics;
    expect(() => validateAdventureAgentData(p, SKILL_DEFINITIONS)).toThrow("skills.acrobatics");
  });
});
