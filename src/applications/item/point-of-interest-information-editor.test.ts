import { describe, expect, it } from "vitest";

import { SKILL_DEFINITIONS } from "../../config/skills";
import type { PointOfInterestSkill } from "../../documents/item/point-of-interest-data";
import {
  buildAvailableSkillOptions,
  buildSkillGroupViewModels,
  readInformationEditPatch,
  SKILL_OPTION_VIEW_MODELS,
} from "./point-of-interest-information-editor";

const groups: readonly PointOfInterestSkill[] = [
  {
    skill: "perception",
    information: [
      { id: "a", difficulty: 6, content: "A", showDifficultyToPlayers: false },
      { id: "b", difficulty: 8, content: "B", showDifficultyToPlayers: true },
    ],
  },
  {
    skill: "crime",
    information: [
      { id: "c", difficulty: 10, content: "C", showDifficultyToPlayers: false },
    ],
  },
];

describe("Point of Interest authoring view models", () => {
  it("mirrors canonical skill order and labels", () => {
    expect(SKILL_OPTION_VIEW_MODELS).toEqual(
      SKILL_DEFINITIONS.map(({ key, label }) => ({ value: key, label })),
    );
  });

  it("preserves persisted insertion order and shows the skill once per group", () => {
    const view = buildSkillGroupViewModels(groups);
    expect(view.map(({ skill }) => skill)).toEqual(["perception", "crime"]);
    expect(view[0]).toMatchObject({
      skillLabel: "Percepção",
      hasMultipleInformation: true,
      information: [{ id: "a" }, { id: "b" }],
    });
    expect(view[0].information[0]).not.toHaveProperty("skill");
  });

  it("offers only skills not already present, preventing duplicate creation", () => {
    const options = buildAvailableSkillOptions(groups);
    expect(options.map(({ value }) => value)).not.toContain("crime");
    expect(options.map(({ value }) => value)).not.toContain("perception");
    expect(options[0]).toEqual({ value: "acrobatics", label: "Acrobacia" });
  });
});

describe("readInformationEditPatch", () => {
  it("edits only DT, visibility, and content", () => {
    expect(readInformationEditPatch("difficulty", "7")).toEqual({ difficulty: 7 });
    expect(readInformationEditPatch("showDifficultyToPlayers", "true")).toEqual({
      showDifficultyToPlayers: true,
    });
    expect(readInformationEditPatch("content", "x")).toEqual({ content: "x" });
    expect(readInformationEditPatch("skill", "perception")).toBeNull();
    expect(readInformationEditPatch("id", "x")).toBeNull();
  });

  it("rejects invalid DT and visibility values", () => {
    for (const value of ["0", "1.5", "", "abc"]) {
      expect(readInformationEditPatch("difficulty", value)).toBeNull();
    }
    expect(readInformationEditPatch("showDifficultyToPlayers", "yes")).toBeNull();
  });
});
