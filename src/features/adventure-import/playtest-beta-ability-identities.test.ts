
import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { BETA_AGENTS } from "../../config/adventure-definitions/playtest-beta";
import { BETA_CANONICAL_ABILITIES, betaAgentAbilityIds } from "./playtest-beta-ability-identities";
import type { PreparedBetaAgent } from "./parse-playtest-beta";

function agent(reference: typeof BETA_AGENTS[number], names: readonly string[]): PreparedBetaAgent {
  return {
    ...reference, level: 3, profile: "Perfil", vocation: "Vocação",
    attributes: { physical: 6, mind: 6, emotion: 6 }, health: 10, determination: 6, skills: [], equipment: "",
    abilities: names.map(name => ({ name, description: "Resumo sintético" })),
  };
}

describe("Beta canonical Ability identities", () => {
  it("resolves every Beta identity to a distinct Item in the canonical pack", async () => {
    const directory = new URL("../../../packs-src/abilities/", import.meta.url);
    const files = (await readdir(directory)).filter(file => file.endsWith(".json") && !file.startsWith("_"));
    const sources = await Promise.all(files.map(async file =>
      JSON.parse(await readFile(new URL(file, directory), "utf8")) as { _id: string; type: string; name: string }));
    const uuids = Object.values(BETA_CANONICAL_ABILITIES);
    expect(new Set(uuids).size).toBe(uuids.length);
    for (const uuid of uuids) {
      expect(uuid).toMatch(/^Compendium\.ordemparanormal2\.abilities\.Item\.ability\d{9}$/u);
      expect(sources.find(source => uuid.endsWith("." + source._id))?.type).toBe("ability");
    }
    expect(BETA_CANONICAL_ABILITIES.mentorship).toBe("Compendium.ordemparanormal2.abilities.Item.ability000000011");
    expect(BETA_CANONICAL_ABILITIES.analysis).not.toBe("Compendium.ordemparanormal2.abilities.Item.ability000000002");
  });

  it("shares one Ímpeto Beta source among the relevant Agents", () => {
    const malik = agent(BETA_AGENTS[4], ["ÍMPETO", "ÍMPETO FERVILHANTE"]);
    const muirenn = agent(BETA_AGENTS[2], ["ÍMPETO", "ARSENAL DE HERBORISTA"]);
    expect(betaAgentAbilityIds(malik)[0]).toBe("impetus");
    expect(betaAgentAbilityIds(muirenn)[0]).toBe("impetus");
  });

  it("rejects a mismatched sheet before it can bind a source", () => {
    const invalid = agent(BETA_AGENTS[4], ["ÍMPETO FERVILHANTE", "ÍMPETO"]);
    expect(() => betaAgentAbilityIds(invalid)).toThrow(/diverge/u);
  });
});
