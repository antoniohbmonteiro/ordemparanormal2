import { describe, expect, it } from "vitest";
import {
  POINT_OF_INTEREST_ALWAYS_AVAILABLE,
  addPointOfInterestApproach, addPointOfInterestInformation,
  examinableAptitudeSpecializations, examinablePlayerInformation,
  isPointOfInterestInformationList, playerVisiblePointOfInterestInformation, readPointOfInterestInformation,
  readPointOfInterestInformationAvailability,
  removePointOfInterestApproach, removePointOfInterestInformation,
  updatePointOfInterestApproach, updatePointOfInterestApproachDifficultyOverride,
  updatePointOfInterestInformation, updatePointOfInterestInformationAvailability,
  type PointOfInterestInformation,
} from "./point-of-interest-data";

const research = { skill: "research" as const, difficulty: 6, showDifficultyToPlayers: false };
const technology = { skill: "technology" as const, difficulty: 8, showDifficultyToPlayers: true };
const always = POINT_OF_INTEREST_ALWAYS_AVAILABLE;
const situational = { mode: "situational" as const, condition: "Requer ter aberto o cofre." };
const information: readonly PointOfInterestInformation[] = [
  { id: "emailBox", content: "Caixa de e-mail", approaches: [research, technology], availability: always },
];

describe("Point of Interest information", () => {
  it("accepts ordered information with several approaches and rejects invalid identities", () => {
    expect(isPointOfInterestInformationList(information)).toBe(true);
    expect(isPointOfInterestInformationList([...information, information[0]])).toBe(false);
    expect(isPointOfInterestInformationList([{ ...information[0], approaches: [research, research] }])).toBe(false);
    expect(isPointOfInterestInformationList([{ ...information[0], approaches: [] }])).toBe(false);
    expect(isPointOfInterestInformationList([{ ...information[0], approaches: [
      { skill: "aptitude", difficulty: 6, showDifficultyToPlayers: false },
    ] }])).toBe(false);
    expect(isPointOfInterestInformationList([{ ...information[0], approaches: [
      { ...research, specialization: "arts" },
    ] }])).toBe(false);
    expect(isPointOfInterestInformationList([{ ...information[0], approaches: [
      { skill: "aptitude", specialization: "arts", difficulty: 6, showDifficultyToPlayers: false },
      { skill: "aptitude", specialization: "humanities", difficulty: 8, showDifficultyToPlayers: true },
    ] }])).toBe(true);
  });

  it("reads only the canonical shape", () => {
    expect(readPointOfInterestInformation({ information })).toEqual(information);
    expect(readPointOfInterestInformation({ skills: [{ skill: "research", information: [] }] })).toEqual([]);
  });

  it("mutates by information identity without changing order or siblings", () => {
    const added = addPointOfInterestInformation(information, "meetingDate", research);
    expect(added.map(entry => entry.id)).toEqual(["emailBox", "meetingDate"]);
    expect(added[1]).toEqual({ id: "meetingDate", content: "", approaches: [research], availability: always });
    expect(() => addPointOfInterestInformation(added, "emailBox", research)).toThrow();
    const edited = updatePointOfInterestInformation(added, "meetingDate", "16 de março");
    expect(edited[1].content).toBe("16 de março");
    expect(removePointOfInterestInformation(edited, "meetingDate")).toEqual(information);
  });

  it("edits approaches, rejects semantic duplicates and protects the last one", () => {
    const one = [{ ...information[0], approaches: [research] }];
    const added = addPointOfInterestApproach(one, "emailBox", technology);
    expect(added[0].approaches).toEqual([research, technology]);
    expect(() => addPointOfInterestApproach(added, "emailBox", research)).toThrow();
    expect(() => updatePointOfInterestApproach(added, "emailBox", 1, research)).toThrow();
    expect(removePointOfInterestApproach(added, "emailBox", 1)).toEqual(one);
    expect(() => removePointOfInterestApproach(one, "emailBox", 0)).toThrow();
  });
});

describe("Point of Interest approach difficulty override", () => {
  const override = { difficulty: 10, condition: "Se o armário for arrombado." };
  const withApproach = (approach: unknown) => [{ ...information[0], approaches: [approach] }];

  it("keeps approaches stored without an override valid and unchanged", () => {
    expect(isPointOfInterestInformationList(withApproach(research))).toBe(true);
    expect(readPointOfInterestInformation({ information: withApproach(research) })[0].approaches).toEqual([research]);
    expect(readPointOfInterestInformation({ information: withApproach({ ...research, difficultyOverride: undefined }) })[0]
      .approaches[0]).not.toHaveProperty("difficultyOverride");
  });

  it("gives manually added approaches no override", () => {
    const added = addPointOfInterestApproach(addPointOfInterestInformation([], "a", research), "a", technology);
    expect(added[0].approaches.every(approach => !("difficultyOverride" in approach))).toBe(true);
  });

  it("accepts one alternative DT with a condition and rejects an invalid DT or a blank condition", () => {
    expect(isPointOfInterestInformationList(withApproach({ ...research, difficultyOverride: override }))).toBe(true);
    expect(readPointOfInterestInformation({ information: withApproach({ ...research, difficultyOverride: override }) })[0]
      .approaches[0]).toEqual({ ...research, difficultyOverride: override });
    for (const invalid of [
      { difficulty: 0, condition: "x" }, { difficulty: 1.5, condition: "x" }, { difficulty: "10", condition: "x" },
      { difficulty: 10, condition: "" }, { difficulty: 10, condition: "   " }, { difficulty: 10 }, null, [override],
    ]) expect(isPointOfInterestInformationList(withApproach({ ...research, difficultyOverride: invalid }))).toBe(false);
  });

  it("adds, edits and removes an approach override without touching the base DT", () => {
    const added = updatePointOfInterestApproachDifficultyOverride(information, "emailBox", 1, override);
    expect(added[0].approaches).toEqual([research, { ...technology, difficultyOverride: override }]);
    const harder = updatePointOfInterestApproachDifficultyOverride(added, "emailBox", 1, { ...override, difficulty: 12 });
    expect(harder[0].approaches[1]).toEqual({ ...technology, difficultyOverride: { ...override, difficulty: 12 } });
    const reworded = updatePointOfInterestApproachDifficultyOverride(harder, "emailBox", 1,
      { difficulty: 12, condition: "Se a porta for forçada." });
    expect(reworded[0].approaches[1].difficultyOverride).toEqual({ difficulty: 12, condition: "Se a porta for forçada." });
    expect(updatePointOfInterestApproachDifficultyOverride(reworded, "emailBox", 1, null)).toEqual(information);
    expect(() => updatePointOfInterestApproachDifficultyOverride(information, "emailBox", 1, { difficulty: 0, condition: "x" }))
      .toThrow();
    expect(() => updatePointOfInterestApproachDifficultyOverride(information, "emailBox", 5, override)).toThrow();
  });
});

describe("Point of Interest information availability", () => {
  it("reads stored information without availability as always available", () => {
    const legacy = [{ id: "emailBox", content: "Caixa de e-mail", approaches: [research, technology] }];
    expect(isPointOfInterestInformationList(legacy)).toBe(true);
    expect(readPointOfInterestInformation({ information: legacy })).toEqual(information);
    expect(readPointOfInterestInformationAvailability(undefined)).toEqual(always);
  });

  it("creates manually added information as always available", () => {
    expect(addPointOfInterestInformation([], "new", research)[0].availability).toEqual({ mode: "always", condition: "" });
  });

  it("accepts always and situational with a non-empty condition, and rejects anything else", () => {
    const withAvailability = (availability: unknown) => [{ ...information[0], availability }];
    expect(isPointOfInterestInformationList(withAvailability({ mode: "always", condition: "" }))).toBe(true);
    expect(isPointOfInterestInformationList(withAvailability(situational))).toBe(true);
    expect(readPointOfInterestInformation({ information: withAvailability(situational) })[0].availability).toEqual(situational);
    for (const invalid of [
      { mode: "situational", condition: "" }, { mode: "situational", condition: "   " }, { mode: "situational" },
      { mode: "always", condition: "Requer algo." }, { mode: "sometimes", condition: "" }, null, "always",
    ]) expect(isPointOfInterestInformationList(withAvailability(invalid))).toBe(false);
    expect(() => updatePointOfInterestInformationAvailability(information, "emailBox",
      { mode: "situational", condition: " " })).toThrow();
  });

  it("hands out writable availability copies, since Foundry cleans update data in place", () => {
    const added = addPointOfInterestInformation(addPointOfInterestInformation([], "a", research), "b", research);
    const changed = updatePointOfInterestInformationAvailability(added, "a", always);
    expect(changed[0].availability).not.toBe(always);
    expect(changed[1].availability).not.toBe(always);
    expect(changed[0].availability).not.toBe(changed[1].availability);
    expect(() => Object.assign(changed[1].availability, { mode: "always", condition: "" })).not.toThrow();
  });

  it("changes availability by information identity", () => {
    const changed = updatePointOfInterestInformationAvailability(information, "emailBox", situational);
    expect(changed[0]).toEqual({ ...information[0], availability: situational });
    expect(updatePointOfInterestInformationAvailability(changed, "emailBox", always)).toEqual(information);
    expect(() => updatePointOfInterestInformationAvailability(information, "unknown", always)).toThrow();
  });

  it("derives examinable information and Aptitude specializations only from undiscovered projection entries", () => {
    const skill = { key: "aptitude" as const, name: "Aptidão", information: [
      { visibility: "hidden" as const, specialization: "currentAffairs" as const },
      { visibility: "public" as const, difficulty: 8, specialization: "currentAffairs" as const },
      { visibility: "hidden" as const, specialization: "humanities" as const, content: "Já conhecida" },
    ] };
    expect(examinablePlayerInformation(skill)).toHaveLength(2);
    expect(examinableAptitudeSpecializations(skill)).toEqual(["currentAffairs"]);
    expect(examinableAptitudeSpecializations({ ...skill, information: [skill.information[2]] })).toEqual([]);
  });

  it("keeps situational information from a player until their Agent knows it", () => {
    const list: readonly PointOfInterestInformation[] = [
      ...information, { id: "vault", content: "Cofre", approaches: [research], availability: situational },
    ];
    expect(playerVisiblePointOfInterestInformation(list, new Set<string>()).map(entry => entry.id)).toEqual(["emailBox"]);
    expect(playerVisiblePointOfInterestInformation(list, new Set(["vault"])).map(entry => entry.id))
      .toEqual(["emailBox", "vault"]);
  });
});
