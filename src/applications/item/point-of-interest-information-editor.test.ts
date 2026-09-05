import { describe, expect, it } from "vitest";

import { SKILL_DEFINITIONS } from "../../config/skills";
import type { PointOfInterestInformation } from "../../documents/item/point-of-interest-data";
import {
  buildInformationRowViewModels,
  readInformationEditPatch,
  SKILL_OPTION_VIEW_MODELS,
} from "./point-of-interest-information-editor";

describe("SKILL_OPTION_VIEW_MODELS", () => {
  it("mirrors the canonical registry order and labels", () => {
    expect(SKILL_OPTION_VIEW_MODELS).toEqual(
      SKILL_DEFINITIONS.map(({ key, label }) => ({ value: key, label })),
    );
    expect(SKILL_OPTION_VIEW_MODELS).toHaveLength(20);
    expect(SKILL_OPTION_VIEW_MODELS).toContainEqual({
      value: "aptitude",
      label: "Aptidão",
    });
  });
});

describe("buildInformationRowViewModels", () => {
  it("builds per-row skill options with a single selected match", () => {
    const list: readonly PointOfInterestInformation[] = [
      { id: "a", skill: "perception", difficulty: 6, content: "A" },
      { id: "b", skill: "crime", difficulty: 10, content: "B" },
    ];

    const rows = buildInformationRowViewModels(list);

    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(rows[0].skillLabel).toBe("Percepção");
    expect(rows[0].skillOptions).toHaveLength(20);
    expect(rows[0].skillOptions.filter((option) => option.selected)).toEqual([
      { value: "perception", label: "Percepção", selected: true },
    ]);
    expect(
      rows[1].skillOptions.find((option) => option.selected)?.value,
    ).toBe("crime");
  });
});

describe("readInformationEditPatch", () => {
  it("accepts a canonical skill key", () => {
    expect(readInformationEditPatch("skill", "perception")).toEqual({
      skill: "perception",
    });
  });

  it("rejects a non-canonical skill", () => {
    expect(readInformationEditPatch("skill", "Percepção")).toBeNull();
    expect(readInformationEditPatch("skill", "nope")).toBeNull();
  });

  it("accepts an integer DT at or above the minimum", () => {
    expect(readInformationEditPatch("difficulty", "7")).toEqual({
      difficulty: 7,
    });
  });

  it("rejects non-integer or out-of-range DT", () => {
    expect(readInformationEditPatch("difficulty", "0")).toBeNull();
    expect(readInformationEditPatch("difficulty", "1.5")).toBeNull();
    expect(readInformationEditPatch("difficulty", "")).toBeNull();
    expect(readInformationEditPatch("difficulty", "abc")).toBeNull();
  });

  it("passes content through and rejects unknown fields", () => {
    expect(readInformationEditPatch("content", "x")).toEqual({ content: "x" });
    expect(readInformationEditPatch("id", "x")).toBeNull();
    expect(readInformationEditPatch(undefined, "x")).toBeNull();
  });
});
