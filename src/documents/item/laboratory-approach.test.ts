import { expect, it } from "vitest";
import { approachIdentity, configureToolInteraction, isPointOfInterestApproach, readPointOfInterestInformation,
  uniformToolMechanicConfigurations, type PointOfInterestInformation, type PointOfInterestToolApproach } from "./point-of-interest-data";
import { toolInformationIds } from "../../core/investigation/resolve-information";
const approach: PointOfInterestToolApproach = { type: "tool", equipmentUuid: "Item.source", useFormId: "analyze",
  mechanicConfig: { type: "laboratory", sequenceLength: 4 } };
const information: readonly PointOfInterestInformation[] = ["a", "b"].map(id => ({ id, content: "", approaches: [approach],
  availability: { mode: "always", condition: "" } }));
it("configuration never changes identity and shared updates preserve IDs, order and other approaches", () => {
  const changed = { ...approach, mechanicConfig: { type: "laboratory" as const, sequenceLength: 6 as const } };
  expect(approachIdentity(changed)).toBe(approachIdentity(approach));
  const updated = configureToolInteraction(information, changed);
  expect(updated.map(entry => entry.id)).toEqual(["a", "b"]);
  expect(updated.every(entry => entry.approaches[0].mechanicConfig?.sequenceLength === 6)).toBe(true);
  expect(uniformToolMechanicConfigurations(updated)).toBe(true);
  expect(information[0].approaches[0].mechanicConfig?.sequenceLength).toBe(4);
  expect(uniformToolMechanicConfigurations([information[0], { ...information[1], approaches: [changed] }])).toBe(false);
});
it("standard Equipment never matches laboratory approaches and native reads preserve the config", () => {
  expect(toolInformationIds(information, new Set<string>(), "Item.source", "analyze")).toEqual([]);
  expect(toolInformationIds(information, new Set(["a"]), "Item.source", "analyze", 4)).toEqual(["b"]);
  expect(readPointOfInterestInformation({ information })).toEqual(information);
  expect(isPointOfInterestApproach({ skill: "research", difficulty: 2, showDifficultyToPlayers: true,
    mechanicConfig: approach.mechanicConfig })).toBe(false);
});
