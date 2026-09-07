import { describe, expect, it } from "vitest";

import {
  addPointOfInterestInformation,
  addPointOfInterestSkill,
  isPointOfInterestInformation,
  isPointOfInterestSkill,
  readPointOfInterestSkills,
  removePointOfInterestInformation,
  removePointOfInterestSkill,
  updatePointOfInterestInformation,
  type PointOfInterestSkill,
} from "./point-of-interest-data";

const information = (id: string, difficulty = 6) => ({
  id,
  difficulty,
  content: `Info ${id}`,
  showDifficultyToPlayers: false,
});

const groups: readonly PointOfInterestSkill[] = [
  { skill: "perception", information: [information("a"), information("b", 8)] },
  { skill: "crime", information: [information("c", 10)] },
];

describe("Point of Interest grouped shape", () => {
  it("accepts information without a repeated skill and groups with 1..N information", () => {
    expect(isPointOfInterestInformation(information("a"))).toBe(true);
    expect(isPointOfInterestSkill(groups[0])).toBe(true);
    expect(isPointOfInterestSkill({ skill: "perception", information: [] })).toBe(false);
    expect(readPointOfInterestSkills({
      skills: [{ skill: "perception", information: [{ ...information("a"), skill: "crime" }] }],
    })[0].information[0]).not.toHaveProperty("skill");
  });

  it("reads zero skills and never interprets the removed flat shape", () => {
    expect(readPointOfInterestSkills({ skills: [] })).toEqual([]);
    expect(readPointOfInterestSkills({ information: [{ ...information("a"), skill: "perception" }] })).toEqual([]);
  });

  it("defensively drops invalid or duplicate skill groups and duplicate ids", () => {
    expect(readPointOfInterestSkills({
      skills: [
        groups[0],
        { skill: "perception", information: [information("z")] },
        { skill: "crime", information: [] },
        { skill: "occultism", information: [information("a")] },
      ],
    })).toEqual(groups.slice(0, 1));
  });

});

describe("Point of Interest grouped mutations", () => {
  it("appends a skill with its first information and rejects duplicate skills", () => {
    const next = addPointOfInterestSkill(groups, "research", "new", { difficulty: 1 });
    expect(next.slice(0, 2)).toEqual(groups);
    expect(next[2]).toEqual({
      skill: "research",
      information: [{ id: "new", difficulty: 1, content: "", showDifficultyToPlayers: false }],
    });
    expect(() => addPointOfInterestSkill(next, "research", "other", { difficulty: 1 })).toThrow();
  });

  it("adds and edits information only inside the selected group with stable ids", () => {
    const added = addPointOfInterestInformation(groups, "crime", "d", { difficulty: 7 });
    expect(added[0]).toBe(groups[0]);
    expect(added[1].information.map(({ id }) => id)).toEqual(["c", "d"]);
    const updated = updatePointOfInterestInformation(added, "crime", "d", {
      difficulty: 9,
      content: "Changed",
    });
    expect(updated[1].information[1]).toEqual({
      id: "d",
      difficulty: 9,
      content: "Changed",
      showDifficultyToPlayers: false,
    });
    expect(() => addPointOfInterestInformation(groups, "crime", "a", { difficulty: 1 })).toThrow();
  });

  it("removes one information while preserving siblings and removes the group at zero", () => {
    const oneRemoved = removePointOfInterestInformation(groups, "perception", "a");
    expect(oneRemoved[0].information).toEqual([information("b", 8)]);
    expect(removePointOfInterestInformation(oneRemoved, "perception", "b")).toEqual([groups[1]]);
  });

  it("removes a skill and all of its information", () => {
    expect(removePointOfInterestSkill(groups, "perception")).toEqual([groups[1]]);
  });
});
