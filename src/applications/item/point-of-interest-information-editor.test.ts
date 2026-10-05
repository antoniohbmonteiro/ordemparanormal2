import { describe, expect, it } from "vitest";
import { SKILL_DEFINITIONS } from "../../config/skills";
import { buildInformationViewModels, difficultyOverrideDraftKey, readApproachFieldPatch, readDifficultyOverride,
  readSituationalAvailability, SKILL_OPTION_VIEW_MODELS } from "./point-of-interest-information-editor";

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

  it("shows alternative DT fields for an existing override or one added here, and an add control otherwise", () => {
    const override = { difficulty: 10, condition: "Se o armário for arrombado." };
    const research = { skill: "research" as const, difficulty: 6, showDifficultyToPlayers: false };
    const entry = { id: "notes", content: "", availability: { mode: "always" as const, condition: "" as const },
      approaches: [{ ...research, difficultyOverride: override }, perception,
        { skill: "aptitude" as const, specialization: "arts" as const, difficulty: 8, showDifficultyToPlayers: false }] };
    const pending = new Set([difficultyOverrideDraftKey("notes", perception)]);
    const view = buildInformationViewModels([entry], new Set<string>(), pending)[0].approaches;
    expect(view.map(approach => [approach.skill, approach.showDifficultyOverride, approach.overrideDifficulty, approach.overrideCondition]))
      .toEqual([["research", true, "10", override.condition], ["perception", true, "", ""], ["aptitude", false, "", ""]]);
    expect(difficultyOverrideDraftKey("notes", entry.approaches[2])).toBe("notes:aptitude:arts");
  });

  it("reads an alternative DT only when its DT is an integer >= 1 and its condition is not blank", () => {
    expect(readDifficultyOverride("10", "  Se o armário for arrombado. ")).toEqual({ difficulty: 10, condition: "Se o armário for arrombado." });
    expect(readDifficultyOverride("12", "Nova condição.")).toEqual({ difficulty: 12, condition: "Nova condição." });
    for (const [difficulty, condition] of [["", "x"], ["0", "x"], ["1.5", "x"], ["abc", "x"], ["10", ""], ["10", "  "]]) {
      expect(readDifficultyOverride(difficulty, condition)).toBeNull();
    }
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
