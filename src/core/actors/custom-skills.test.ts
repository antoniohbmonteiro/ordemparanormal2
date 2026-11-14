import { describe, expect, it } from "vitest";
import { buildAgentCheck } from "../../application/checks/build-agent-check";
import { reachableInformationIds } from "../investigation/resolve-information";
import { customSkillKey, listCustomSkillOptions, readCustomSkillCatalog, readSkillDie, splitCustomSkillKey } from "./custom-skills";

const id = "custom_1234567890abcdef";
const first = "spec_1234567890abcdef";
const second = "spec_9876543210abcdef";
const definition = {
  id, baseAttribute: "mind", kind: "specialized", archived: false, revision: 1, name: "Amendoim",
  specializations: [{ id: first, name: "Doce", archived: false }, { id: second, name: "Salgado", archived: true }],
} as const;

describe("custom skills", () => {
  it("reserves canonical and archived names and rejects duplicate specializations", () => {
    expect(readCustomSkillCatalog({ version: 1, definitions: [{ ...definition, name: "APTidãO" }] })).toBeUndefined();
    expect(readCustomSkillCatalog({ version: 1, definitions: [definition, {
      ...definition, id: "custom_9876543210abcdef", name: " Amêndoim ", archived: true,
    }] })).toBeUndefined();
    expect(readCustomSkillCatalog({ version: 1, definitions: [{
      ...definition, specializations: [definition.specializations[0], { id: second, name: " Dóce ", archived: true }],
    }] })).toBeUndefined();
  });

  it("uses the exact specialization's die and preserves the Check component identity", () => {
    const catalog = readCustomSkillCatalog({ version: 1, definitions: [definition] })!;
    const options = listCustomSkillOptions(catalog);
    const key = customSkillKey(id, first);
    const archived = customSkillKey(id, second);
    const source = { attributes: { physical: 4, mind: 8, emotion: 4 } as const,
      skills: {}, customSkills: { [key]: 6, [archived]: 10 } as const, customSkillOptions: options };
    expect(options.map(option => option.archived)).toEqual([false, true]);
    expect(splitCustomSkillKey(key)).toEqual({ skill: id, specialization: first });
    expect(buildAgentCheck({ kind: "skill", key }, source, key => key).components).toMatchObject([
      { key: "mind", die: 8 }, { key, kind: "specialization", die: 6 },
    ]);
    expect(buildAgentCheck({ kind: "skill", key: archived }, source, key => key).components[1]?.die).toBe(10);
    expect(() => buildAgentCheck({ kind: "skill", key }, { ...source, customSkills: { [key]: null } }, key => key)).toThrow();
    expect(readSkillDie(4)).toBe(4);
    expect(readSkillDie(undefined)).toBeUndefined();
  });

  it("does not reveal information for another specialization of the same skill", () => {
    const information = [first, second].map(specialization => ({ id: specialization,
      availability: { mode: "always" as const }, approaches: [{ skill: id, specialization, difficulty: 4 }] }));
    expect(reachableInformationIds(information, new Set<string>(), id, first, 8)).toEqual([first]);
  });
});
