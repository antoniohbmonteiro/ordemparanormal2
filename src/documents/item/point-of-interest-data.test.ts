import { describe, expect, it } from "vitest";
import {
  addPointOfInterestApproach, addPointOfInterestInformation,
  isPointOfInterestInformationList, readPointOfInterestInformation,
  removePointOfInterestApproach, removePointOfInterestInformation,
  updatePointOfInterestApproach, updatePointOfInterestInformation,
  type PointOfInterestInformation,
} from "./point-of-interest-data";

const research = { skill: "research" as const, difficulty: 6, showDifficultyToPlayers: false };
const technology = { skill: "technology" as const, difficulty: 8, showDifficultyToPlayers: true };
const information: readonly PointOfInterestInformation[] = [
  { id: "emailBox", content: "Caixa de e-mail", approaches: [research, technology] },
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
    expect(added[1]).toEqual({ id: "meetingDate", content: "", approaches: [research] });
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
