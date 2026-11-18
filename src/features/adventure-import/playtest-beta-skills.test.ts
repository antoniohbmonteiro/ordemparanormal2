import { BETA_AGENTS } from "../../config/adventure-definitions/playtest-beta";

import { describe, expect, it } from "vitest";
import { EMPTY_CUSTOM_SKILL_CATALOG, readCustomSkillCatalog } from "../../core/actors/custom-skills";
import { createBetaDocumentPlan } from "./playtest-beta-content";
import { betaSkillReference } from "./parse-playtest-beta";
import { BETA_SKILL_DEFINITIONS, planBetaSkills, resolveBetaSkill } from "./playtest-beta-skills";
import type { PreparedBetaMission } from "./prepare-playtest-beta";

function skills(rows: readonly [string, 4 | 6 | 8][]) {
  return rows.map(([label, die]) => ({ label, die, reference: betaSkillReference(label)! }));
}

const mission: PreparedBetaMission = {
  mission: "mission1", file: new File([], "extras.zip"), threats: [], narrative: [],
  agents: [
    { ...BETA_AGENTS[0], level: 3,
      profile: "Analista", vocation: "Ferreira", attributes: { physical: 8, mind: 6, emotion: 4 },
      health: 12, determination: 6, abilities: [], equipment: "",
      skills: skills([["Ocultismo", 6], ["Animais", 4], ["Ofício (Metalurgia)", 8], ["Aptidão", 4]]) },
    { ...BETA_AGENTS[1], level: 3,
      profile: "Vigilante", vocation: "Adestrador", attributes: { physical: 8, mind: 6, emotion: 4 },
      health: 12, determination: 6, abilities: [], equipment: "",
      skills: skills([["Ofício", 6], ["Inspecionar", 4], ["Aptidão (Guerra)", 6]]) },
  ],
  pois: [{ id: "clue", name: "Pista", sections: [], context: "", rows: [
    { id: "clue-1", page: 37, difficulty: 8, labels: ["Ofício (Metalurgia)", "Aptidão (Guerra)"], content: "Pista sintética." },
  ] }],
};

describe("Playtest Beta skill bindings", () => {
  it("plans stable definitions once and preserves the distinction between source labels", () => {
    const planned = planBetaSkills([mission], EMPTY_CUSTOM_SKILL_CATALOG, true);
    const catalog = { version: 1 as const, definitions: planned.create };
    expect(catalog.definitions).toEqual(BETA_SKILL_DEFINITIONS);
    expect(readCustomSkillCatalog(catalog)).toEqual(catalog);
    const repeat = planBetaSkills([mission], catalog, true);
    expect(repeat.create).toEqual([]);
    expect(repeat.bindings).toEqual(planned.bindings);
    expect(repeat.canonical).toEqual(["Ocultismo"]);
    const aptitude = catalog.definitions.find(skill => skill.kind === "specialized");
    expect(aptitude?.specializations.map(spec => spec.name)).toEqual(["Artes", "Erudição", "Folclore", "Guerra", "Nobreza", "Religião"]);
    expect(repeat.pending).toMatchObject([{ label: "Aptidão", page: 1, value: 4 }]);
    expect(resolveBetaSkill("Aptidão", repeat.bindings)).toBeUndefined();
    expect(resolveBetaSkill("Bruxaria", repeat.bindings)).toBeUndefined();
    expect(resolveBetaSkill("Metalurgia", repeat.bindings)).toBeUndefined();
  });

  it("assigns only each Agent's printed dice and shares keys with POI approaches", () => {
    const plan = planBetaSkills([mission], EMPTY_CUSTOM_SKILL_CATALOG, true);
    const docs = createBetaDocumentPlan({ missions: [mission], maps: {} }, plan, (_mission, path) => path).preflight;
    const metal = resolveBetaSkill("Ofício (Metalurgia)", plan.bindings)!;
    const craft = resolveBetaSkill("Ofício", plan.bindings)!;
    const animals = resolveBetaSkill("Animais", plan.bindings)!;
    const inspect = resolveBetaSkill("Inspecionar", plan.bindings)!;
    const war = resolveBetaSkill("Aptidão (Guerra)", plan.bindings)!;
    expect(docs.find(doc => doc.id === "agent:rhiona")?.source.system)
      .toMatchObject({ customSkills: { [metal.custom!]: 8, [animals.custom!]: 4 } });
    expect(docs.find(doc => doc.id === "agent:rowan")?.source.system)
      .toMatchObject({ customSkills: { [craft.custom!]: 6, [inspect.custom!]: 4, [war.custom!]: 6 } });
    expect(docs.find(doc => doc.id === "agent:rhiona")?.managed).not.toHaveProperty(`system.customSkills.${craft.custom}`);
    expect(docs.find(doc => doc.id === "poi:mission1:clue")?.source.system)
      .toMatchObject({ information: [{ approaches: [{ skill: metal.skill }, { skill: war.skill, specialization: war.specialization }] }] });
  });

  it("reuses compatible manual IDs and isolates archived and conflicting definitions", () => {
    const manual = { ...BETA_SKILL_DEFINITIONS[0], id: "custom_1234567890abcdef", revision: 7 } as const;
    const archived = { ...BETA_SKILL_DEFINITIONS[2], archived: true };
    const collision = { ...BETA_SKILL_DEFINITIONS[3], name: "Outra perícia" };
    const catalog = { version: 1 as const, definitions: [manual, archived, collision] };
    const result = planBetaSkills([mission], catalog, true);
    expect(result.reused).toEqual(["Animais"]);
    expect(resolveBetaSkill("Animais", result.bindings)?.custom).toBe(manual.id);
    expect(result.conflicts.map(conflict => conflict.name)).toEqual(["Ofício", "Ofício (Metalurgia)"]);
    expect(result.create.map(definition => definition.name)).toEqual(["Inspecionar", "Aptidão Beta"]);
    expect(result.pending.map(entry => entry.label)).toEqual(["Ofício (Metalurgia)", "Aptidão", "Ofício", "Ofício (Metalurgia)"]);
    expect(catalog.definitions).toEqual([manual, archived, collision]);
  });
});
