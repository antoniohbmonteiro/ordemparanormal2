import { describe, expect, it } from "vitest";
import { SKILL_DEFINITIONS } from "../../config/skills";
import { buildInformationViewModels, readApproachFieldPatch, SKILL_OPTION_VIEW_MODELS } from "./point-of-interest-information-editor";

describe("Point of Interest authoring view models", () => {
  it("offers canonical skill labels and preserves authored order", () => {
    expect(SKILL_OPTION_VIEW_MODELS).toEqual(SKILL_DEFINITIONS.map(({ key, label }) => ({ value: key, label })));
    const view = buildInformationViewModels([{ id: "emailBox", content: "Caixa", approaches: [
      { skill: "research", difficulty: 6, showDifficultyToPlayers: false },
      { skill: "aptitude", specialization: "arts", difficulty: 8, showDifficultyToPlayers: true },
    ] }]);
    expect(view[0].displayIndex).toBe(1);
    expect(view[0].approaches.map(approach => approach.skill)).toEqual(["research", "aptitude"]);
    expect(view[0].approaches[1].specializationOptions.find(option => option.selected)?.value).toBe("arts");
    expect(view[0].canRemoveApproach).toBe(true);
  });
  it("rejects invalid DT and visibility inputs", () => {
    expect(readApproachFieldPatch("difficulty", "7")).toEqual({ difficulty: 7 });
    expect(readApproachFieldPatch("showDifficultyToPlayers", "true")).toEqual({ showDifficultyToPlayers: true });
    for (const value of ["0", "1.5", "", "abc"]) expect(readApproachFieldPatch("difficulty", value)).toBeNull();
    expect(readApproachFieldPatch("showDifficultyToPlayers", "yes")).toBeNull();
  });
});
