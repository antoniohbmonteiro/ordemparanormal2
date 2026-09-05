import { describe, expect, it } from "vitest";

import { SKILL_DEFINITIONS } from "../../../config/skills";
import { readAgentCheckSource } from "./read-agent-check-source";

function createActor(): foundry.documents.Actor {
  const skills = Object.fromEntries(
    SKILL_DEFINITIONS.map((definition) => [
      definition.key,
      "specializations" in definition
        ? Object.fromEntries(
            definition.specializations.map(({ key }) => [key, 4]),
          )
        : 4,
    ]),
  );

  return {
    type: "agent",
    system: {
      attributes: { physical: 6, mind: 8, emotion: 10 },
      skills,
    },
  } as unknown as foundry.documents.Actor;
}

describe("Agent check source reader", () => {
  it("copies current attribute, skill, and specialization values", () => {
    const actor = createActor();
    const source = readAgentCheckSource(actor);

    expect(source.attributes).toEqual({ physical: 6, mind: 8, emotion: 10 });
    expect(source.skills.perception).toBe(4);
    expect(source.skills.aptitude).toEqual({
      arts: 4,
      currentAffairs: 4,
      bureaucracy: 4,
      exactSciences: 4,
      humanities: 4,
      tactics: 4,
    });
    expect(source.attributes).not.toBe(
      (actor.system as { attributes: object }).attributes,
    );
    expect(source.skills.aptitude).not.toBe(
      (actor.system as { skills: { aptitude: object } }).skills.aptitude,
    );
  });

  it("rejects d20 for ordinary skills", () => {
    const actor = createActor();
    (actor.system as { skills: { perception: number } }).skills.perception = 20;

    expect(() => readAgentCheckSource(actor)).toThrow(
      "system.skills.perception",
    );
  });

  it("rejects d20 for Aptitude specializations", () => {
    const actor = createActor();
    (
      actor.system as { skills: { aptitude: { arts: number } } }
    ).skills.aptitude.arts = 20;

    expect(() => readAgentCheckSource(actor)).toThrow(
      "system.skills.aptitude.arts",
    );
  });
});
