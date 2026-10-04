import { expect, it } from "vitest";
import { configureToolInteraction, isPointOfInterestApproach, readPointOfInterestInformation,
  uniformToolMechanicConfigurations, type PointOfInterestInformation, type PointOfInterestToolApproach } from "./point-of-interest-data";
import { toolInformationIds } from "../../core/investigation/resolve-information";
const approach: PointOfInterestToolApproach = { type: "tool", equipmentUuid: "Item.radio", useFormId: "tune",
  mechanicConfig: { type: "radio", trueFragments: ["O sinal", "vem do porão"], falseFragments: ["na torre"] } };
const information: readonly PointOfInterestInformation[] = ["a", "b"].map(id => ({ id, content: "", approaches: [approach],
  availability: { mode: "always", condition: "" } }));
it("copies radio configurations deeply and preserves shared identity and order", () => {
  const read = readPointOfInterestInformation({ information });
  expect(read).toEqual(information);
  expect(read[0]!.approaches[0]!.mechanicConfig).not.toBe(approach.mechanicConfig);
  const changed = { ...approach, mechanicConfig: { type: "radio" as const, trueFragments: ["Nova mensagem"], falseFragments: [] } };
  expect(uniformToolMechanicConfigurations([information[0]!, { ...information[1]!, approaches: [changed] }])).toBe(false);
  const updated = configureToolInteraction(information, changed);
  expect(updated.map(entry => entry.id)).toEqual(["a", "b"]);
  expect(uniformToolMechanicConfigurations(updated)).toBe(true);
  expect(updated[0]!.approaches[0]!.mechanicConfig).not.toBe(updated[1]!.approaches[0]!.mechanicConfig);
});
it("never lets a standard form match radio or a skill accept its configuration", () => {
  expect(toolInformationIds(information, new Set<string>(), "Item.radio", "tune")).toEqual([]);
  expect(isPointOfInterestApproach({ skill: "technology", difficulty: 2, showDifficultyToPlayers: true,
    mechanicConfig: approach.mechanicConfig })).toBe(false);
});
