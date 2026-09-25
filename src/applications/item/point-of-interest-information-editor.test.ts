import { describe, expect, it } from "vitest";
import { SKILL_DEFINITIONS } from "../../config/skills";
import { buildInformationViewModels, readApproachFieldPatch, readSituationalAvailability,
  SKILL_OPTION_VIEW_MODELS } from "./point-of-interest-information-editor";

const perception = { skill: "perception" as const, difficulty: 6, showDifficultyToPlayers: false };

describe("Point of Interest authoring view models", () => {
  it("offers canonical skill labels and preserves authored order", () => {
    expect(SKILL_OPTION_VIEW_MODELS).toEqual(SKILL_DEFINITIONS.map(({ key, label }) => ({ value: key, label })));
    const view = buildInformationViewModels([{ id: "emailBox", content: "Caixa", availability: { mode: "always", condition: "" },
      approaches: [
        { skill: "research", difficulty: 6, showDifficultyToPlayers: false },
        { skill: "aptitude", specialization: "arts", difficulty: 8, showDifficultyToPlayers: true },
      ] }]);
    expect(view[0].displayIndex).toBe(1);
    expect(view[0].approaches.map(approach => approach.skill)).toEqual(["research", "aptitude"]);
    expect(view[0].approaches[1].specializationOptions.find(option => option.selected)?.value).toBe("arts");
    expect(view[0].canRemoveApproach).toBe(true);
  });
  it("shows the condition only for situational information, including one switched here before its condition", () => {
    const view = buildInformationViewModels([
      { id: "always", content: "", approaches: [perception], availability: { mode: "always", condition: "" } },
      { id: "situational", content: "", approaches: [perception],
        availability: { mode: "situational", condition: "Requer ter aberto o freezer." } },
      { id: "pending", content: "", approaches: [perception], availability: { mode: "always", condition: "" } },
    ], new Set(["pending"]));
    expect(view.map(entry => [entry.id, entry.availabilityOptions.find(option => option.selected)?.value,
      entry.showCondition, entry.condition])).toEqual([
      ["always", "always", false, ""],
      ["situational", "situational", true, "Requer ter aberto o freezer."],
      ["pending", "situational", true, ""],
    ]);
    expect(view[0].availabilityOptions.map(option => option.label)).toEqual([
      "ORDEMPARANORMAL2.PointOfInterestSheet.Availability.Always",
      "ORDEMPARANORMAL2.PointOfInterestSheet.Availability.Situational",
    ]);
  });

  it("requires a non-empty condition for situational information", () => {
    expect(readSituationalAvailability("  Apenas Victor e Alan. ")).toEqual({ mode: "situational", condition: "Apenas Victor e Alan." });
    expect(readSituationalAvailability("   ")).toBeNull();
  });

  it("rejects invalid DT and visibility inputs", () => {
    expect(readApproachFieldPatch("difficulty", "7")).toEqual({ difficulty: 7 });
    expect(readApproachFieldPatch("showDifficultyToPlayers", "true")).toEqual({ showDifficultyToPlayers: true });
    for (const value of ["0", "1.5", "", "abc"]) expect(readApproachFieldPatch("difficulty", value)).toBeNull();
    expect(readApproachFieldPatch("showDifficultyToPlayers", "yes")).toBeNull();
  });
});
