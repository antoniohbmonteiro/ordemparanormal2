import { describe, expect, it } from "vitest";

import {
  addPointOfInterestInformation,
  assertUniquePointOfInterestInformationIds,
  collectPoiInvestigationSkills,
  isPointOfInterestInformation,
  readPointOfInterestInformationList,
  removePointOfInterestInformation,
  updatePointOfInterestInformation,
  type PointOfInterestInformation,
} from "./point-of-interest-data";

const rows: readonly PointOfInterestInformation[] = [
  { id: "a", skill: "perception", difficulty: 6, content: "A", showDifficultyToPlayers: false },
  { id: "b", skill: "crime", difficulty: 10, content: "B", showDifficultyToPlayers: false },
  { id: "c", skill: "aptitude", difficulty: 2, content: "C", showDifficultyToPlayers: false },
];

describe("isPointOfInterestInformation", () => {
  it("accepts a canonical entry", () => {
    expect(isPointOfInterestInformation(rows[0])).toBe(true);
  });

  it("rejects non-canonical skill, bad difficulty and blank id", () => {
    expect(
      isPointOfInterestInformation({
        id: "x",
        skill: "Percepção",
        difficulty: 6,
        content: "", showDifficultyToPlayers: false,
      }),
    ).toBe(false);
    expect(
      isPointOfInterestInformation({
        id: "x",
        skill: "perception",
        difficulty: 0,
        content: "", showDifficultyToPlayers: false,
      }),
    ).toBe(false);
    expect(
      isPointOfInterestInformation({
        id: "  ",
        skill: "perception",
        difficulty: 6,
        content: "", showDifficultyToPlayers: false,
      }),
    ).toBe(false);
  });
});

describe("readPointOfInterestInformationList", () => {
  it("keeps well-formed rows", () => {
    expect(readPointOfInterestInformationList({ information: rows })).toEqual(rows);
  });

  it("drops rows with a non-canonical skill", () => {
    expect(
      readPointOfInterestInformationList({
        information: [
          { id: "a", skill: "perception", difficulty: 6, content: "A", showDifficultyToPlayers: false },
          { id: "b", skill: "lockpicking", difficulty: 6, content: "B", showDifficultyToPlayers: false },
          { id: "c", skill: "Percepção", difficulty: 6, content: "C", showDifficultyToPlayers: false },
        ],
      }),
    ).toEqual([{ id: "a", skill: "perception", difficulty: 6, content: "A", showDifficultyToPlayers: false }]);
  });

  it("drops structurally invalid rows", () => {
    expect(
      readPointOfInterestInformationList({
        information: [
          { id: "", skill: "perception", difficulty: 6, content: "A", showDifficultyToPlayers: false },
          { id: "b", skill: "perception", difficulty: 1.5, content: "B", showDifficultyToPlayers: false },
          { id: "c", skill: "perception", difficulty: 0, content: "C", showDifficultyToPlayers: false },
          { id: "d", skill: "perception", difficulty: 6, content: 7 },
        ],
      }),
    ).toEqual([]);
  });

  it("returns an empty list for non-object or non-array input", () => {
    expect(readPointOfInterestInformationList(null)).toEqual([]);
    expect(readPointOfInterestInformationList("nope")).toEqual([]);
    expect(readPointOfInterestInformationList({ information: {} })).toEqual([]);
  });
});

describe("collectPoiInvestigationSkills", () => {
  it("derives distinct skills from information in first-occurrence order", () => {
    expect(collectPoiInvestigationSkills({
      information: [rows[0], rows[0], rows[1], rows[0], rows[2]],
    })).toEqual(["perception", "crime", "aptitude"]);
    expect(collectPoiInvestigationSkills(null)).toEqual([]);
  });

  it("preserves legacy information without exposing its difficulty", () => {
    const legacy = { id: "old", skill: "perception", difficulty: 9, content: "Private" };
    expect(readPointOfInterestInformationList({ information: [legacy], showDifficultiesToPlayers: true })).toEqual([{ ...legacy, showDifficultyToPlayers: false }]);
  });
});

describe("addPointOfInterestInformation", () => {
  it("appends at the end and defaults content to empty", () => {
    const next = addPointOfInterestInformation([], "a", {
      skill: "research",
      difficulty: 4,
    });
    expect(next).toEqual([
      { id: "a", skill: "research", difficulty: 4, content: "", showDifficultyToPlayers: false },
    ]);
  });

  it("throws on blank id", () => {
    expect(() =>
      addPointOfInterestInformation([], "  ", {
        skill: "research",
        difficulty: 4,
      }),
    ).toThrow();
  });

  it("throws on duplicate id", () => {
    expect(() =>
      addPointOfInterestInformation(rows, "a", {
        skill: "research",
        difficulty: 4,
      }),
    ).toThrow();
  });
});

describe("updatePointOfInterestInformation", () => {
  it("merges only the matched row and preserves order and siblings", () => {
    const next = updatePointOfInterestInformation(rows, "b", { difficulty: 12 });
    expect(next).toEqual([
      rows[0],
      { id: "b", skill: "crime", difficulty: 12, content: "B", showDifficultyToPlayers: false },
      rows[2],
    ]);
    expect(next[0]).toBe(rows[0]);
    expect(next[2]).toBe(rows[2]);
  });

  it("throws when the id is absent", () => {
    expect(() =>
      updatePointOfInterestInformation(rows, "z", { difficulty: 1 }),
    ).toThrow();
  });
});

describe("removePointOfInterestInformation", () => {
  it("removes only the matched row and leaves the rest identical", () => {
    const next = removePointOfInterestInformation(rows, "a");
    expect(next).toEqual([rows[1], rows[2]]);
    expect(next[0]).toBe(rows[1]);
    expect(next[1]).toBe(rows[2]);
  });
});

describe("assertUniquePointOfInterestInformationIds", () => {
  it("passes on unique ids and throws on duplicates", () => {
    expect(() => assertUniquePointOfInterestInformationIds(rows)).not.toThrow();
    expect(() =>
      assertUniquePointOfInterestInformationIds([rows[0], rows[0]]),
    ).toThrow();
  });
});
